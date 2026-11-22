/**
 * Supabase の表(help_requests)の 1 行 ⇔ プログラムの依頼(HelpRequest)の変換(純粋関数)。
 * 表の列名は snake_case(user_id)、プログラムは camelCase(userId)なので、ここで読み替える。
 * 表の作り方は supabase/migrations/0001_init.sql(leader_user_id は 0002_leader_and_points.sql)。
 */
import type { Helper, HelpRequest, HelpRequestStatus, Ratings, SnowAmount, WorkResult } from "./model.js";
import type { Versioned } from "./repository.js";

/** 表に書き込む列(version と updated_at は保存するときに付ける)。 */
export type HelpRequestRow = {
  readonly id: string;
  readonly user_id: string;
  readonly amount: SnowAmount;
  readonly name: string | null;
  readonly address: string | null;
  readonly lat: number | null;
  readonly lng: number | null;
  readonly depth: string | null;
  readonly tools: string | null;
  readonly status: HelpRequestStatus;
  readonly created_at: string;
  readonly helpers: readonly Helper[];
  readonly leader_user_id: string | null;
  readonly started_at: string | null;
  readonly finished_at: string | null;
  readonly cancelled_at: string | null;
  readonly result: WorkResult | null;
  readonly ratings: Ratings | null;
  readonly thanked_at: string | null;
};

const STATUSES: readonly string[] = ["waiting", "accepted", "working", "done", "cancelled"];
const AMOUNTS: readonly string[] = ["little", "normal", "lots"];

/** 表から読んだ行がおかしいときのエラー。 */
export class InvalidRowError extends Error {}

type RawRow = Readonly<Record<string, unknown>>;

const textOrNull = (value: unknown): string | null => (typeof value === "string" ? value : null);
const numberOrNull = (value: unknown): number | null => (typeof value === "number" ? value : null);

/**
 * 時刻をプログラムと同じ形("2026-11-23T07:00:00.000Z")にそろえる。
 * Postgres は "2026-11-23 07:00:00+00" のような形で返すことがあるため。
 */
export function normalizeTimestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new InvalidRowError(`時刻の形が正しくありません: ${value}`);
  return date.toISOString();
}

function requireText(row: RawRow, column: string): string {
  const value = row[column];
  if (typeof value !== "string") throw new InvalidRowError(`列 ${column} が読めません。`);
  return value;
}

function requireOneOf<T extends string>(row: RawRow, column: string, allowed: readonly string[]): T {
  const value = requireText(row, column);
  if (!allowed.includes(value)) throw new InvalidRowError(`列 ${column} の値が正しくありません: ${value}`);
  return value as T;
}

/** 依頼 → 表の行。 */
export function toRow(r: HelpRequest): HelpRequestRow {
  return {
    id: r.id,
    user_id: r.userId,
    amount: r.amount,
    name: r.name,
    address: r.address,
    lat: r.lat,
    lng: r.lng,
    depth: r.depth,
    tools: r.tools,
    status: r.status,
    created_at: r.createdAt,
    helpers: r.helpers,
    leader_user_id: r.leaderUserId,
    started_at: r.startedAt,
    finished_at: r.finishedAt,
    cancelled_at: r.cancelledAt,
    result: r.result,
    ratings: r.ratings,
    thanked_at: r.thankedAt,
  };
}

/** 表の行 → 依頼。必要な列がおかしければ InvalidRowError。 */
export function fromRow(row: RawRow): HelpRequest {
  return {
    id: requireText(row, "id"),
    userId: requireText(row, "user_id"),
    amount: requireOneOf<SnowAmount>(row, "amount", AMOUNTS),
    name: textOrNull(row.name),
    address: textOrNull(row.address),
    lat: numberOrNull(row.lat),
    lng: numberOrNull(row.lng),
    depth: textOrNull(row.depth),
    tools: textOrNull(row.tools),
    status: requireOneOf<HelpRequestStatus>(row, "status", STATUSES),
    createdAt: normalizeTimestamp(requireText(row, "created_at")) ?? "",
    helpers: Array.isArray(row.helpers) ? (row.helpers as readonly Helper[]) : [],
    leaderUserId: textOrNull(row.leader_user_id),
    startedAt: normalizeTimestamp(row.started_at),
    finishedAt: normalizeTimestamp(row.finished_at),
    cancelledAt: normalizeTimestamp(row.cancelled_at),
    result: (row.result as WorkResult | null | undefined) ?? null,
    ratings: (row.ratings as Ratings | null | undefined) ?? null,
    thankedAt: normalizeTimestamp(row.thanked_at),
  };
}

/** 表の行 → 依頼と版(version)。 */
export function fromVersionedRow(row: RawRow): Versioned {
  const version = row.version;
  if (typeof version !== "number") throw new InvalidRowError("列 version が読めません。");
  return { request: fromRow(row), version };
}
