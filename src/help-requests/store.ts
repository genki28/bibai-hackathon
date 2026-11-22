/**
 * お年寄りからの「雪かきの依頼」を覚えておく場所。
 * 実際の保存先(メモリ / Supabase)は repository.ts の窓口で差し替える。
 * 状態の進め方(参加・開始・終了など)は transitions.ts、入力の確かめ方は inputs.ts にある。
 * ここはそれらをつなぐだけで、ルールは書かない。
 */
import { randomUUID } from "node:crypto";
import { fail, isJoinable, isOngoingForElder, MAX_HELPERS } from "./model.js";
import type { HelpRequest, HelpRequestInput, Ratings, Result } from "./model.js";
import type { FinishInput, JoinInput } from "./inputs.js";
import { createMemoryHelpRequestRepository, ONGOING_STATUSES } from "./repository.js";
import type { HelpRequestRepository } from "./repository.js";
import * as transitions from "./transitions.js";
import type { RandomSource } from "./leader.js";

export { parseHelpRequestInput } from "./inputs.js";
export type { HelpRequest, HelpRequestInput, HelpRequestStatus, SnowAmount } from "./model.js";

export type HelpRequestStore = {
  /** 依頼を登録する。同じ人のまだ終わっていない依頼があれば、新しく作らずそれを返す。 */
  readonly create: (input: HelpRequestInput, now: Date) => Promise<HelpRequest>;
  /** だれも参加していない依頼の一覧。 */
  readonly listWaiting: () => Promise<readonly HelpRequest[]>;
  /** 若者が参加できる依頼(募集中・参加受付中で、定員に空きがある)の一覧。 */
  readonly listOpen: () => Promise<readonly HelpRequest[]>;
  /** 終わった依頼(ランキングの集計用)。 */
  readonly listFinished: () => Promise<readonly HelpRequest[]>;
  readonly findById: (id: string) => Promise<HelpRequest | null>;
  /** その人のまだ終わっていない(雪かき前・雪かき中の)依頼。なければ null。 */
  readonly findWaiting: (userId: string) => Promise<HelpRequest | null>;
  /** お年寄りの待機画面用。取り消し・いいね済みを除いた、いちばん新しい依頼。なければ null。 */
  readonly findMine: (userId: string) => Promise<HelpRequest | null>;
  readonly join: (id: string, input: JoinInput, now: Date) => Promise<Result<HelpRequest>>;
  readonly leave: (id: string, userId: string) => Promise<Result<HelpRequest>>;
  readonly arrive: (id: string, userId: string, now: Date) => Promise<Result<HelpRequest>>;
  /** 雪かきを始める(到着した人ならだれでも)。このときリーダーがランダムに決まる。 */
  readonly start: (id: string, userId: string, now: Date) => Promise<Result<HelpRequest>>;
  readonly finish: (
    id: string,
    input: FinishInput,
    snowDepthM: number,
    now: Date,
  ) => Promise<Result<HelpRequest>>;
  readonly cancel: (id: string, userId: string, now: Date) => Promise<Result<HelpRequest>>;
  readonly thank: (
    id: string,
    userId: string,
    ratings: Ratings,
    now: Date,
  ) => Promise<Result<HelpRequest>>;
  /** 依頼した人か参加者が userIds のだれかである依頼を消す(テスト用のデータを消すとき用)。消した件数を返す。 */
  readonly deleteInvolving: (userIds: readonly string[]) => Promise<number>;
};

/** ほかの人と同時に書き換えてぶつかったとき、やり直す回数。 */
const MAX_ATTEMPTS = 3;

const NOT_FOUND = fail(404, "依頼が見つかりません。");
const TOO_BUSY = fail(409, "ほかの人の操作と重なりました。少し待ってから、もう一度お試しください。");

function newRequest(input: HelpRequestInput, now: Date): HelpRequest {
  return {
    id: randomUUID(),
    userId: input.userId,
    amount: input.amount,
    name: input.name ?? null,
    address: input.address ?? null,
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    depth: input.depth ?? null,
    tools: input.tools ?? null,
    status: "waiting",
    createdAt: now.toISOString(),
    helpers: [],
    leaderUserId: null,
    startedAt: null,
    finishedAt: null,
    cancelledAt: null,
    result: null,
    ratings: null,
    thankedAt: null,
  };
}

type Change = (r: HelpRequest) => Result<HelpRequest>;

/**
 * id の依頼を読んで change を当て、うまくいったら保存する(楽観ロック)。
 * 保存の直前にほかの人が書き換えていたら、読み直してルールを当て直す。
 */
async function applyChange(
  repo: HelpRequestRepository,
  id: string,
  change: Change,
): Promise<Result<HelpRequest>> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const current = await repo.findById(id);
    if (!current) return NOT_FOUND;
    const result = change(current.request);
    // 失敗、または何も変わらない(すでに参加済みなど)ときは保存しない
    if (!result.ok || result.value === current.request) return result;
    if (await repo.update(result.value, current.version)) return result;
  }
  console.error(`[エラー] 依頼 ${id} の更新が ${MAX_ATTEMPTS} 回ぶつかりました`);
  return TOO_BUSY;
}

export type HelpRequestStoreOptions = {
  /** リーダーを選ぶときの乱数(テストで差し替える)。ふだんは Math.random。 */
  readonly random?: RandomSource;
};

export function createHelpRequestStore(
  repo: HelpRequestRepository = createMemoryHelpRequestRepository(),
  options: HelpRequestStoreOptions = {},
): HelpRequestStore {
  const random = options.random ?? Math.random;
  const update = (id: string, change: Change) => applyChange(repo, id, change);

  const findWaiting = async (userId: string): Promise<HelpRequest | null> => {
    const mine = await repo.listByUser(userId);
    return mine.find((r) => ONGOING_STATUSES.includes(r.status)) ?? null;
  };

  const create = async (input: HelpRequestInput, now: Date): Promise<HelpRequest> => {
    const existing = await findWaiting(input.userId);
    if (existing) return existing;
    const created = newRequest(input, now);
    if (await repo.insert(created)) return created;
    // 同時に 2 回送られて、もう片方が先に保存した
    const saved = await findWaiting(input.userId);
    if (!saved) throw new Error("依頼を保存できませんでした(同じ人の依頼とぶつかりました)。");
    return saved;
  };

  return {
    create,
    findWaiting,
    findById: async (id) => (await repo.findById(id))?.request ?? null,
    listFinished: () => repo.listByStatus(["done"]),
    listWaiting: () => repo.listByStatus(["waiting"]),
    listOpen: async () =>
      (await repo.listByStatus(["waiting", "accepted", "working"])).filter(
        (r) => isJoinable(r) && r.helpers.length < MAX_HELPERS,
      ),
    findMine: async (userId) =>
      (await repo.listByUser(userId)).filter(isOngoingForElder).at(-1) ?? null,
    join: (id, input, now) => update(id, (r) => transitions.join(r, input, now)),
    leave: (id, userId) => update(id, (r) => transitions.leave(r, userId)),
    arrive: (id, userId, now) => update(id, (r) => transitions.arrive(r, userId, now)),
    start: (id, userId, now) => update(id, (r) => transitions.start(r, userId, now, random)),
    finish: (id, input, snowDepthM, now) =>
      update(id, (r) => transitions.finish(r, input, snowDepthM, now)),
    cancel: (id, userId, now) => update(id, (r) => transitions.cancel(r, userId, now)),
    thank: (id, userId, ratings, now) =>
      update(id, (r) => transitions.thank(r, userId, ratings, now)),
    deleteInvolving: (userIds) => repo.deleteInvolving(userIds),
  };
}
