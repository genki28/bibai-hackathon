/**
 * 依頼の「保存の窓口」(リポジトリ = データの出し入れだけをする部品)。
 * 中身は 2 種類: メモリ版(このファイル。テストや Supabase 未設定のとき用)と
 * Supabase 版(supabase-repository.ts)。
 *
 * 同時に書き換えても壊れないように「楽観ロック」を使う。
 * 読んだときの version を覚えておき、書くときに「version が変わっていなければ書く」。
 * 変わっていたら(= ほかの人が先に書いた)false を返すので、呼んだ側で読み直してやり直す。
 */
import type { HelpRequest, HelpRequestStatus } from "./model.js";

/** 依頼と、読んだときの版(version)。 */
export type Versioned = {
  readonly request: HelpRequest;
  readonly version: number;
};

export type HelpRequestRepository = {
  readonly findById: (id: string) => Promise<Versioned | null>;
  /** その人の依頼(古い順)。 */
  readonly listByUser: (userId: string) => Promise<readonly HelpRequest[]>;
  /** 指定した状態の依頼(古い順)。 */
  readonly listByStatus: (
    statuses: readonly HelpRequestStatus[],
  ) => Promise<readonly HelpRequest[]>;
  /** 新しく保存する。同じ人のまだ終わっていない依頼がすでにあって保存できなければ false。 */
  readonly insert: (request: HelpRequest) => Promise<boolean>;
  /** version が expectedVersion のままなら書き換えて true。ほかの人が先に書いていたら false。 */
  readonly update: (request: HelpRequest, expectedVersion: number) => Promise<boolean>;
  /** 依頼した人か参加者が userIds のだれかである依頼を消して、消した件数を返す(テスト用のデータを消すとき用)。 */
  readonly deleteInvolving: (userIds: readonly string[]) => Promise<number>;
};

/** 「まだ終わっていない(雪かき前・雪かき中)」の状態。1 人 1 つまで。 */
export const ONGOING_STATUSES: readonly HelpRequestStatus[] = ["waiting", "accepted", "working"];

const isOngoing = (r: HelpRequest): boolean => ONGOING_STATUSES.includes(r.status);

/** 依頼した人か参加者が userIds のだれかか。 */
export const involvesAny = (r: HelpRequest, userIds: readonly string[]): boolean =>
  userIds.includes(r.userId) || r.helpers.some((h) => userIds.includes(h.userId));

/** メモリ版。サーバーを再起動すると消える。 */
export function createMemoryHelpRequestRepository(): HelpRequestRepository {
  let rows: readonly Versioned[] = [];

  return {
    findById: async (id) => rows.find((row) => row.request.id === id) ?? null,
    listByUser: async (userId) =>
      rows.map((row) => row.request).filter((r) => r.userId === userId),
    listByStatus: async (statuses) =>
      rows.map((row) => row.request).filter((r) => statuses.includes(r.status)),
    insert: async (request) => {
      const hasOngoing = rows.some((row) => row.request.userId === request.userId && isOngoing(row.request));
      if (hasOngoing && isOngoing(request)) return false;
      rows = [...rows, { request, version: 0 }];
      return true;
    },
    update: async (request, expectedVersion) => {
      const current = rows.find((row) => row.request.id === request.id);
      if (!current || current.version !== expectedVersion) return false;
      const next: Versioned = { request, version: expectedVersion + 1 };
      rows = rows.map((row) => (row.request.id === request.id ? next : row));
      return true;
    },
    deleteInvolving: async (userIds) => {
      const kept = rows.filter((row) => !involvesAny(row.request, userIds));
      const deleted = rows.length - kept.length;
      rows = kept;
      return deleted;
    },
  };
}
