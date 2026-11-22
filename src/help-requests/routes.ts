import express from "express";
import type { Response, Router } from "express";
import { isValidUserId } from "../identity/store.js";
import {
  isValidRequestId,
  parseFinishInput,
  parseHelpRequestInput,
  parseJoinInput,
  parseThanksInput,
  parseUserIdInput,
} from "./inputs.js";
import type { HelpRequest, Result } from "./model.js";
import { buildRanking, isRankingPeriod } from "./ranking.js";
import { DEFAULT_SNOW_DEPTH_M } from "./score.js";
import type { GetSnowDepthM } from "./snow-depth.js";
import { createHelpRequestStore } from "./store.js";
import type { HelpRequestStore } from "./store.js";
import { toMemberView, toPublicView, toViewFor, viewerOf } from "./views.js";

const INVALID_USER_ID = "ユーザー ID の形が正しくありません。";
const INVALID_REQUEST_ID = "依頼 ID の形が正しくありません。";
const INVALID_INPUT = "入力の内容が正しくありません。";
const NOT_FOUND = "依頼が見つかりません。";

export type HelpRequestRouterOptions = {
  readonly store?: HelpRequestStore;
  readonly getSnowDepthM?: GetSnowDepthM;
  readonly now?: () => Date;
};

/** 書き込み API の中身。入力がおかしければ null を返す(→ 400)。 */
type Action = (id: string, body: unknown, now: Date) => Promise<Result<HelpRequest> | null>;

const sendError = (res: Response, status: number, error: string): void => {
  res.status(status).json({ success: false, error });
};

/** 依頼の結果を、操作した本人から見た形で返す。 */
function sendResult(res: Response, result: Result<HelpRequest>, userId: string): void {
  if (!result.ok) {
    sendError(res, result.status, result.error);
    return;
  }
  res.json({ success: true, data: toViewFor(result.value, userId) });
}

/** ?userId= を読む。なければ null、形がおかしければ undefined。 */
function readUserIdQuery(value: unknown): string | null | undefined {
  if (value === undefined) return null;
  return isValidUserId(value) ? value : undefined;
}

/**
 * 雪かきの依頼の API。すべて { success, data } か { success: false, error } で返す。
 * 保存先(Supabase など)でエラーが起きたときは、app.ts のエラー処理が 500 と日本語のエラーを返す。
 * ⚠ いまは送られてきた userId をそのまま信じている(LINE の ID トークンでの確認は未実装)。
 * 一覧・詳細・書き込みの一覧は docs/features/pages.md を参照。
 */
export function createHelpRequestRouter(options: HelpRequestRouterOptions = {}): Router {
  const store = options.store ?? createHelpRequestStore();
  const getSnowDepthM = options.getSnowDepthM ?? (async () => DEFAULT_SNOW_DEPTH_M);
  const now = options.now ?? (() => new Date());
  const router = express.Router();
  router.use("/api/help-requests", express.json());

  router.post("/api/help-requests", async (req, res) => {
    const input = parseHelpRequestInput(req.body);
    if (!input) {
      sendError(res, 400, "依頼の内容が正しくありません。");
      return;
    }
    res.status(201).json({ success: true, data: await store.create(input, now()) });
  });

  router.get("/api/help-requests", async (_req, res) => {
    const open = await store.listOpen();
    res.json({ success: true, data: open.map(toPublicView) });
  });

  router.get("/api/help-requests/mine/:userId", async (req, res) => {
    const { userId } = req.params;
    if (!isValidUserId(userId)) {
      sendError(res, 400, INVALID_USER_ID);
      return;
    }
    const mine = await store.findMine(userId);
    res.json({ success: true, data: mine ? toMemberView(mine, "elder") : null });
  });

  router.get("/api/help-requests/:id", async (req, res) => {
    const userId = readUserIdQuery(req.query.userId);
    if (!isValidRequestId(req.params.id) || userId === undefined) {
      sendError(res, 400, userId === undefined ? INVALID_USER_ID : INVALID_REQUEST_ID);
      return;
    }
    const request = await store.findById(req.params.id);
    if (!request) {
      sendError(res, 404, NOT_FOUND);
      return;
    }
    res.json({ success: true, data: toViewFor(request, userId) });
  });

  /** POST /api/help-requests/:id/{name} を登録する。入力がおかしければ 400。 */
  const post = (name: string, action: Action): void => {
    router.post(`/api/help-requests/:id/${name}`, async (req, res) => {
      const { id } = req.params;
      if (!isValidRequestId(id)) {
        sendError(res, 400, INVALID_REQUEST_ID);
        return;
      }
      const result = await action(id, req.body, now());
      if (!result) {
        sendError(res, 400, INVALID_INPUT);
        return;
      }
      sendResult(res, result, (req.body as { userId: string }).userId);
    });
  };

  const withUserId =
    (run: (id: string, userId: string, at: Date) => Promise<Result<HelpRequest>>): Action =>
    async (id, body, at) => {
      const userId = parseUserIdInput(body);
      return userId ? run(id, userId, at) : null;
    };

  post("join", async (id, body, at) => {
    const input = parseJoinInput(body);
    return input ? store.join(id, input, at) : null;
  });
  post("leave", withUserId((id, userId) => store.leave(id, userId)));
  post("arrive", withUserId(store.arrive));
  post("start", withUserId(store.start));
  post("cancel", withUserId(store.cancel));
  post("finish", async (id, body, at) => {
    const input = parseFinishInput(body);
    if (!input) return null;
    // 先に依頼の有無と権限を見てから、天気予報を問い合わせる
    const request = await store.findById(id);
    const isHelper = request !== null && viewerOf(request, input.userId) === "helper";
    const snowDepthM = isHelper && request.status === "working" ? await getSnowDepthM() : 0;
    return store.finish(id, input, snowDepthM, at);
  });
  post("thanks", async (id, body, at) => {
    const input = parseThanksInput(body);
    return input ? store.thank(id, input.userId, input.ratings, at) : null;
  });

  router.get("/api/ranking", async (req, res) => {
    const period = req.query.period ?? "total";
    const userId = readUserIdQuery(req.query.userId);
    if (!isRankingPeriod(period) || userId === undefined) {
      sendError(res, 400, userId === undefined ? INVALID_USER_ID : "期間(period)は daily か total を指定してください。");
      return;
    }
    const finished = await store.listFinished();
    res.json({ success: true, data: buildRanking(finished, period, now(), userId) });
  });

  return router;
}
