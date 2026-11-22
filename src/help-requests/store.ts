/**
 * お年寄りからの「雪かきの依頼」を覚えておく場所。
 * いまはサーバーのメモリに置いているので、再起動すると消える(Supabase につなぐときに置き換える)。
 * 状態の進め方(参加・開始・終了など)は transitions.ts、入力の確かめ方は inputs.ts にある。
 */
import { randomUUID } from "node:crypto";
import { fail, isOngoingForElder, isOpen, MAX_HELPERS } from "./model.js";
import type { HelpRequest, HelpRequestInput, Ratings, Result } from "./model.js";
import type { FinishInput, JoinInput } from "./inputs.js";
import * as transitions from "./transitions.js";

export { parseHelpRequestInput } from "./inputs.js";
export type { HelpRequest, HelpRequestInput, HelpRequestStatus, SnowAmount } from "./model.js";

export type HelpRequestStore = {
  /** 依頼を登録する。同じ人のまだ終わっていない依頼があれば、新しく作らずそれを返す。 */
  readonly create: (input: HelpRequestInput, now: Date) => HelpRequest;
  /** だれも参加していない依頼の一覧。 */
  readonly listWaiting: () => readonly HelpRequest[];
  /** 若者が参加できる依頼(募集中・参加受付中で、定員に空きがある)の一覧。 */
  readonly listOpen: () => readonly HelpRequest[];
  /** すべての依頼(ランキングの集計用)。 */
  readonly listAll: () => readonly HelpRequest[];
  readonly findById: (id: string) => HelpRequest | null;
  /** その人のまだ終わっていない(雪かき前・雪かき中の)依頼。なければ null。 */
  readonly findWaiting: (userId: string) => HelpRequest | null;
  /** お年寄りの待機画面用。取り消し・いいね済みを除いた、いちばん新しい依頼。なければ null。 */
  readonly findMine: (userId: string) => HelpRequest | null;
  readonly join: (id: string, input: JoinInput, now: Date) => Result<HelpRequest>;
  readonly leave: (id: string, userId: string) => Result<HelpRequest>;
  readonly arrive: (id: string, userId: string, now: Date) => Result<HelpRequest>;
  readonly start: (id: string, userId: string, now: Date) => Result<HelpRequest>;
  readonly finish: (
    id: string,
    input: FinishInput,
    snowDepthM: number,
    now: Date,
  ) => Result<HelpRequest>;
  readonly cancel: (id: string, userId: string, now: Date) => Result<HelpRequest>;
  readonly thank: (id: string, userId: string, ratings: Ratings, now: Date) => Result<HelpRequest>;
};

const NOT_FOUND = fail(404, "依頼が見つかりません。");

const isBeforeDone = (r: HelpRequest): boolean => isOpen(r) || r.status === "working";

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
    startedAt: null,
    finishedAt: null,
    cancelledAt: null,
    result: null,
    ratings: null,
    thankedAt: null,
  };
}

export function createHelpRequestStore(): HelpRequestStore {
  let requests: readonly HelpRequest[] = [];

  const findById = (id: string): HelpRequest | null => requests.find((r) => r.id === id) ?? null;

  /** id の依頼に change を当てて、うまくいったら置き換える。 */
  const update = (
    id: string,
    change: (r: HelpRequest) => Result<HelpRequest>,
  ): Result<HelpRequest> => {
    const current = findById(id);
    if (!current) return NOT_FOUND;
    const result = change(current);
    if (result.ok) {
      requests = requests.map((r) => (r.id === id ? result.value : r));
    }
    return result;
  };

  const findWaiting = (userId: string): HelpRequest | null =>
    requests.find((r) => r.userId === userId && isBeforeDone(r)) ?? null;

  return {
    findById,
    findWaiting,
    listAll: () => requests,
    listWaiting: () => requests.filter((r) => r.status === "waiting"),
    listOpen: () => requests.filter((r) => isOpen(r) && r.helpers.length < MAX_HELPERS),
    findMine: (userId) =>
      requests.filter((r) => r.userId === userId && isOngoingForElder(r)).at(-1) ?? null,
    create: (input, now) => {
      const existing = findWaiting(input.userId);
      if (existing) return existing;
      const created = newRequest(input, now);
      requests = [...requests, created];
      return created;
    },
    join: (id, input, now) => update(id, (r) => transitions.join(r, input, now)),
    leave: (id, userId) => update(id, (r) => transitions.leave(r, userId)),
    arrive: (id, userId, now) => update(id, (r) => transitions.arrive(r, userId, now)),
    start: (id, userId, now) => update(id, (r) => transitions.start(r, userId, now)),
    finish: (id, input, snowDepthM, now) =>
      update(id, (r) => transitions.finish(r, input, snowDepthM, now)),
    cancel: (id, userId, now) => update(id, (r) => transitions.cancel(r, userId, now)),
    thank: (id, userId, ratings, now) =>
      update(id, (r) => transitions.thank(r, userId, ratings, now)),
  };
}
