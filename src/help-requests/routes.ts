import express from "express";
import type { Response, Router } from "express";
import { isValidUserId } from "../identity/store.js";
import type { Referral } from "../invites/model.js";
import { countCommunity } from "./community.js";
import {
  isValidRequestId,
  parseFinishInput,
  parseHelpRequestInput,
  parseJoinInput,
  parseThanksInput,
  parseUserIdInput,
} from "./inputs.js";
import { canFinish } from "./leader.js";
import type { HelpRequest, Result } from "./model.js";
import { buildRanking, isRankingPeriod } from "./ranking.js";
import { pointsForRequest } from "./request-points.js";
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
  /** 招待の記録(勧誘ポイントの集計用)。渡さなければ招待なしとして数える。 */
  readonly listReferrals?: () => Promise<readonly Referral[]>;
  /** 参加の取り消しに成功したあとに呼ぶ(本人確認を取り消して、次に参加するときにもう一度確認させる)。 */
  readonly onLeave?: (userId: string) => Promise<void>;
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
  const listReferrals = options.listReferrals ?? (async () => []);
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

  // 若者が画面を閉じたあと、続きに戻るため: いま参加している雪かき(その人から見た形)か null
  router.get("/api/help-requests/active/:userId", async (req, res) => {
    const { userId } = req.params;
    if (!isValidUserId(userId)) {
      sendError(res, 400, INVALID_USER_ID);
      return;
    }
    const active = await store.findActive(userId, now());
    res.json({ success: true, data: active ? toMemberView(active, "helper") : null });
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

  // お疲れ様の画面用: この依頼で自分がもらったポイントの内訳(参加者だけ・終わった依頼だけ)
  router.get("/api/help-requests/:id/points", async (req, res) => {
    const userId = readUserIdQuery(req.query.userId);
    if (!isValidRequestId(req.params.id) || !userId) {
      sendError(res, 400, userId ? INVALID_REQUEST_ID : INVALID_USER_ID);
      return;
    }
    const request = await store.findById(req.params.id);
    if (!request) {
      sendError(res, 404, NOT_FOUND);
      return;
    }
    if (viewerOf(request, userId) !== "helper") {
      sendError(res, 403, "この依頼に参加していません。");
      return;
    }
    if (request.status !== "done") {
      sendError(res, 409, "雪かきがまだ終わっていません。");
      return;
    }
    const [finished, referrals] = await Promise.all([store.listFinished(), listReferrals()]);
    res.json({ success: true, data: pointsForRequest(request, userId, finished, referrals) });
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
  const onLeave = options.onLeave ?? (async () => {});
  post(
    "leave",
    withUserId(async (id, userId) => {
      const result = await store.leave(id, userId);
      if (result.ok) await onLeave(userId);
      return result;
    }),
  );
  post("arrive", withUserId(store.arrive));
  // 到着した人ならだれでも開始できる。開始した瞬間にリーダーがランダムに決まる
  post("start", withUserId(store.start));
  post("cancel", withUserId(store.cancel));
  post("finish", async (id, body, at) => {
    const input = parseFinishInput(body);
    if (!input) return null;
    // 先に依頼の有無と権限(リーダーだけ)を見てから、天気予報を問い合わせる
    const request = await store.findById(id);
    const canAsk = request !== null && request.status === "working" && canFinish(request, input.userId);
    const snowDepthM = canAsk ? await getSnowDepthM() : 0;
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
    const [finished, referrals] = await Promise.all([store.listFinished(), listReferrals()]);
    res.json({ success: true, data: buildRanking(finished, period, now(), userId, referrals) });
  });

  // 仲間ゲージ(美唄の仲間を 2 倍に)。計算は community.ts
  router.get("/api/community", async (_req, res) => {
    res.json({ success: true, data: countCommunity(await store.listFinished()) });
  });

  return router;
}
