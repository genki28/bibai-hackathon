import express from "express";
import type { Response, Router } from "express";
import { isValidUserId } from "../identity/store.js";
import type { Referral } from "../invites/model.js";
import { arrivalCodeFor, helperForCode, isArrivalCodeInput } from "./arrival-code.js";
import { countCommunity } from "./community.js";
import { buildSnowMap, teamsOf } from "./snow-map.js";
import {
  isValidRequestId,
  parseFinishInput,
  parseHelpRequestInput,
  parseJoinInput,
  parseLocationInput,
  parseScoopsInput,
  parseThanksInput,
  parseUserIdInput,
} from "./inputs.js";
import { canFinish } from "./leader.js";
import { fail } from "./model.js";
import type { HelpRequest, Result } from "./model.js";
import type { NotifyElder } from "./notify.js";
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
  /** 若者が参加した(向かい始めた)あとに呼ぶ(依頼したお年寄りの LINE に知らせる)。 */
  readonly notifyElder?: NotifyElder;
  /** 音の合言葉を作るための秘密(サーバーだけが知っている値)。空なら手元用の値を使う。 */
  readonly arrivalCodeSecret?: string;
};

/** 書き込み API の中身。入力がおかしければ null を返す(→ 400)。 */
type Action = (id: string, body: unknown, now: Date) => Promise<Result<HelpRequest> | null>;

const sendError = (res: Response, status: number, error: string): void => {
  res.status(status).json({ success: false, error });
};

/** 依頼の結果を、操作した本人から見た形で返す。 */
function sendResult(res: Response, result: Result<HelpRequest>, userId: string, at: Date): void {
  if (!result.ok) {
    sendError(res, result.status, result.error);
    return;
  }
  res.json({ success: true, data: toViewFor(result.value, userId, at) });
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
    res.json({ success: true, data: mine ? toMemberView(mine, "elder", now()) : null });
  });

  // 若者が画面を閉じたあと、続きに戻るため: いま参加している雪かき(その人から見た形)か null
  router.get("/api/help-requests/active/:userId", async (req, res) => {
    const { userId } = req.params;
    if (!isValidUserId(userId)) {
      sendError(res, 400, INVALID_USER_ID);
      return;
    }
    const active = await store.findActive(userId, now());
    res.json({ success: true, data: active ? toMemberView(active, "helper", now()) : null });
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
    res.json({ success: true, data: toViewFor(request, userId, now()) });
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
      const at = now();
      const result = await action(id, req.body, at);
      if (!result) {
        sendError(res, 400, INVALID_INPUT);
        return;
      }
      sendResult(res, result, (req.body as { userId: string }).userId, at);
    });
  };

  const withUserId =
    (run: (id: string, userId: string, at: Date) => Promise<Result<HelpRequest>>): Action =>
    async (id, body, at) => {
      const userId = parseUserIdInput(body);
      return userId ? run(id, userId, at) : null;
    };

  const notifyElder = options.notifyElder ?? (async () => {});
  post("join", async (id, body, at) => {
    const input = parseJoinInput(body);
    if (!input) return null;
    const result = await store.join(id, input, at);
    // 向かい始めたことを、お年寄りに知らせる(失敗しても参加はそのまま)
    if (result.ok) await notifyElder(result.value, input.displayName);
    return result;
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
  // 音の合言葉で到着(スマホを近づける)。若者のスマホが鳴らした合言葉を、お年寄りのスマホが聞き取って送る
  const arrivalCodeSecret = options.arrivalCodeSecret ?? "";
  post("arrive-by-sound", async (id, body, at) => {
    const userId = parseUserIdInput(body);
    const code = (body as { code?: unknown } | null)?.code;
    if (!userId || !isArrivalCodeInput(code)) return null;
    const request = await store.findById(id);
    if (!request) return fail(404, NOT_FOUND);
    if (viewerOf(request, userId) !== "elder") return fail(403, "合言葉を聞き取れるのは、依頼した人だけです。");
    const helperId = helperForCode(id, request.helpers, arrivalCodeSecret, code);
    if (!helperId) return fail(400, "合言葉が違います。");
    return store.arrive(id, helperId, at);
  });
  // 自分の合言葉を受け取る(参加した若者本人だけ)
  router.get("/api/help-requests/:id/arrival-code", async (req, res) => {
    const { id } = req.params;
    const userId = readUserIdQuery(req.query.userId);
    if (!userId) {
      sendError(res, 400, INVALID_USER_ID);
      return;
    }
    if (!isValidRequestId(id)) {
      sendError(res, 400, INVALID_REQUEST_ID);
      return;
    }
    const request = await store.findById(id);
    if (!request) {
      sendError(res, 404, NOT_FOUND);
      return;
    }
    if (viewerOf(request, userId) !== "helper") {
      sendError(res, 403, "合言葉は、参加した人だけが受け取れます。");
      return;
    }
    res.json({ success: true, data: { code: arrivalCodeFor(id, userId, arrivalCodeSecret) } });
  });
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
  // スコップ計: その参加者のすくった回数を残す(雪かき中だけ。ポイントには入れない)
  post("scoops", async (id, body) => {
    const input = parseScoopsInput(body);
    return input ? store.recordScoops(id, input.userId, input.count, input.calories) : null;
  });
  // 向かっている若者の現在地(参加者だけ・到着前だけ)。見えるのは依頼したお年寄り本人だけ(views.ts)
  post("location", async (id, body, at) => {
    const input = parseLocationInput(body);
    return input ? store.recordLocation(id, input, at) : null;
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
  // 美唄の雪山の地図(誰でも見られる。家の正確な位置・住所・お年寄りの名前は出さない)
  router.get("/api/snow-map", async (_req, res) => {
    res.json({ success: true, data: buildSnowMap(await store.listFinished()) });
  });

  // 自分が入ったチームと、消費カロリーの合計(ランキングの代わり)
  router.get("/api/teams/mine/:userId", async (req, res) => {
    const { userId } = req.params;
    if (!isValidUserId(userId)) {
      sendError(res, 400, INVALID_USER_ID);
      return;
    }
    res.json({ success: true, data: teamsOf(await store.listFinished(), userId) });
  });

  router.get("/api/community", async (_req, res) => {
    res.json({ success: true, data: countCommunity(await store.listFinished()) });
  });

  return router;
}
