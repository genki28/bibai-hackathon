/**
 * ランキングの集計(純粋関数)。4 種類のポイントを合計する(値は score.ts、判定は bonuses.ts)。
 * - 雪かき: 終わった依頼に参加した全員に、その依頼の workPoints(終わった時刻で数える)
 * - 評価: お年寄りが付けた星 × 100(いいねを送った時刻で数える)
 * - 勧誘: 誘った人が初めて雪かきを終えたら +500、誘われた人にも「はじめての雪かき」+200(終えた時刻で数える)
 * - 再会: 前の別の依頼でも一緒だった参加者 1 人につき +150(依頼ごと。終わった時刻で数える)
 * daily は日本時間の「今日」の分だけ、total はすべて。
 */
import type { Referral } from "../invites/model.js";
import type { HelpRequest } from "./model.js";
import { recruitAwards, reunionPartners } from "./bonuses.js";
import { calculateRatingPoints, REUNION_POINTS_PER_PARTNER } from "./score.js";

export type RankingPeriod = "daily" | "total";
export const RANKING_PERIODS: readonly RankingPeriod[] = ["daily", "total"];

/** ポイントの種類。recruit には「はじめての雪かき」ボーナスも入る。 */
export type PointKind = "work" | "rating" | "recruit" | "reunion";

/** ポイントの内訳(種類ごとの合計)。 */
export type PointBreakdown = Readonly<Record<PointKind, number>>;

export type RankingEntry = {
  readonly rank: number;
  readonly displayName: string;
  readonly points: number;
  readonly breakdown: PointBreakdown;
  readonly isMe: boolean;
};

type PointEvent = {
  readonly userId: string;
  readonly kind: PointKind;
  readonly points: number;
  readonly at: string;
};

const EMPTY_BREAKDOWN: PointBreakdown = { work: 0, rating: 0, recruit: 0, reunion: 0 };

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
  return r.helpers.map((h) => ({ userId: h.userId, kind: "work", points: workPoints, at }));
}

function ratingEvents(r: HelpRequest): readonly PointEvent[] {
  if (!r.ratings || !r.thankedAt) return [];
  const at = r.thankedAt;
  return Object.entries(r.ratings).map(([userId, stars]) => ({
    userId,
    kind: "rating",
    points: calculateRatingPoints(stars),
    at,
  }));
}

function reunionEvents(r: HelpRequest, finished: readonly HelpRequest[]): readonly PointEvent[] {
  if (r.status !== "done" || !r.finishedAt) return [];
  const at = r.finishedAt;
  return r.helpers
    .map((h) => ({ userId: h.userId, partners: reunionPartners(r, h.userId, finished) }))
    .filter(({ partners }) => partners.length > 0)
    .map(({ userId, partners }) => ({
      userId,
      kind: "reunion",
      points: partners.length * REUNION_POINTS_PER_PARTNER,
      at,
    }));
}

function recruitEvents(referrals: readonly Referral[], finished: readonly HelpRequest[]): readonly PointEvent[] {
  return referrals
    .flatMap((referral) => recruitAwards(referral, finished))
    .map(({ userId, points, at }) => ({ userId, kind: "recruit", points, at }));
}

/** すべてのポイントの出来事(期間で絞る前)。 */
export function pointEvents(
  finished: readonly HelpRequest[],
  referrals: readonly Referral[],
): readonly PointEvent[] {
  return [
    ...finished.flatMap((r) => [...workEvents(r), ...ratingEvents(r), ...reunionEvents(r, finished)]),
    ...recruitEvents(referrals, finished),
  ];
}

/** 若者のユーザー ID → 表示名(いちばん新しい参加のときの名前)。 */
function displayNames(requests: readonly HelpRequest[]): ReadonlyMap<string, string> {
  return new Map(requests.flatMap((r) => r.helpers.map((h) => [h.userId, h.displayName] as const)));
}

function sumByUser(events: readonly PointEvent[]): ReadonlyMap<string, PointBreakdown> {
  return events.reduce((totals, e) => {
    const current = totals.get(e.userId) ?? EMPTY_BREAKDOWN;
    const next: PointBreakdown = { ...current, [e.kind]: current[e.kind] + e.points };
    return new Map([...totals, [e.userId, next]]);
  }, new Map<string, PointBreakdown>());
}

const totalOf = (b: PointBreakdown): number => b.work + b.rating + b.recruit + b.reunion;

/** ポイントの多い順に並べる。同じポイントは同じ順位。 */
export function buildRanking(
  requests: readonly HelpRequest[],
  period: RankingPeriod,
  now: Date,
  viewerUserId: string | null = null,
  referrals: readonly Referral[] = [],
): readonly RankingEntry[] {
  const today = toJstDate(now);
  const events = pointEvents(requests, referrals).filter(
    (e) => period === "total" || toJstDate(new Date(e.at)) === today,
  );
  const names = displayNames(requests);
  const sorted = [...sumByUser(events)]
    .map(([userId, breakdown]) => ({ userId, breakdown, points: totalOf(breakdown) }))
    .sort((a, b) => b.points - a.points);
  return sorted.map(({ userId, breakdown, points }) => ({
    rank: sorted.findIndex((e) => e.points === points) + 1,
    displayName: names.get(userId) ?? "名無し",
    points,
    breakdown,
    isMe: userId === viewerUserId,
  }));
}
