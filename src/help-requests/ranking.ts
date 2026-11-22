/**
 * ランキングの集計(純粋関数)。
 * - 雪かきのポイント: 終わった依頼に参加した全員に、その依頼の workPoints が入る(終わった時刻で数える)
 * - 評価のポイント: お年寄りが付けた星 × 100(いいねを送った時刻で数える)
 * daily は日本時間の「今日」の分だけ、total はすべて。
 * 再会ボーナス・勧誘ポイントは未実装。
 */
import type { HelpRequest } from "./model.js";
import { calculateRatingPoints } from "./score.js";

export type RankingPeriod = "daily" | "total";
export const RANKING_PERIODS: readonly RankingPeriod[] = ["daily", "total"];

export type RankingEntry = {
  readonly rank: number;
  readonly displayName: string;
  readonly points: number;
  readonly isMe: boolean;
};

type PointEvent = {
  readonly userId: string;
  readonly points: number;
  readonly at: string;
};

const JST_OFFSET_MS = 9 * 3_600_000;

/** 日本時間の日付("YYYY-MM-DD")。 */
export function toJstDate(date: Date): string {
  return new Date(date.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

export const isRankingPeriod = (value: unknown): value is RankingPeriod =>
  typeof value === "string" && (RANKING_PERIODS as readonly string[]).includes(value);

function workEvents(r: HelpRequest): readonly PointEvent[] {
  if (r.status !== "done" || !r.result || !r.finishedAt) return [];
  const { workPoints } = r.result;
  const at = r.finishedAt;
  return r.helpers.map((h) => ({ userId: h.userId, points: workPoints, at }));
}

function ratingEvents(r: HelpRequest): readonly PointEvent[] {
  if (!r.ratings || !r.thankedAt) return [];
  const at = r.thankedAt;
  return Object.entries(r.ratings).map(([userId, stars]) => ({
    userId,
    points: calculateRatingPoints(stars),
    at,
  }));
}

/** 若者のユーザー ID → 表示名(いちばん新しい参加のときの名前)。 */
function displayNames(requests: readonly HelpRequest[]): ReadonlyMap<string, string> {
  return new Map(requests.flatMap((r) => r.helpers.map((h) => [h.userId, h.displayName] as const)));
}

function sumByUser(events: readonly PointEvent[]): ReadonlyMap<string, number> {
  return events.reduce(
    (totals, e) => new Map([...totals, [e.userId, (totals.get(e.userId) ?? 0) + e.points]]),
    new Map<string, number>(),
  );
}

/** ポイントの多い順に並べる。同じポイントは同じ順位。 */
export function buildRanking(
  requests: readonly HelpRequest[],
  period: RankingPeriod,
  now: Date,
  viewerUserId: string | null = null,
): readonly RankingEntry[] {
  const today = toJstDate(now);
  const events = requests
    .flatMap((r) => [...workEvents(r), ...ratingEvents(r)])
    .filter((e) => period === "total" || toJstDate(new Date(e.at)) === today);
  const names = displayNames(requests);
  const sorted = [...sumByUser(events)].sort(([, a], [, b]) => b - a);
  return sorted.map(([userId, points]) => ({
    rank: sorted.findIndex(([, p]) => p === points) + 1,
    displayName: names.get(userId) ?? "名無し",
    points,
    isMe: userId === viewerUserId,
  }));
}
