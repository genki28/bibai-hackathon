/**
 * お疲れ様の画面用: 終わった依頼 1 件で、その人がもらったポイントの内訳(純粋関数)。
 * 雪かき・評価・再会ボーナス(だれと再会したか)・はじめての雪かきボーナス。
 * 誘った人に入る勧誘ポイント(+500)は誘った人のものなので、ここには出さない(ランキングで数える)。
 */
import type { Referral } from "../invites/model.js";
import { findHelper } from "./model.js";
import type { HelpRequest } from "./model.js";
import { recruitAwards, reunionPartners } from "./bonuses.js";
import { calculateRatingPoints, REUNION_POINTS_PER_PARTNER } from "./score.js";

export type RequestPoints = {
  readonly workPoints: number;
  /** 星の数。いいねがまだなら null。 */
  readonly stars: number | null;
  readonly ratingPoints: number;
  readonly reunion: {
    readonly points: number;
    /** 再会した人の表示名(参加した順)。 */
    readonly partners: readonly string[];
  };
  readonly firstFinishBonus: number;
  /** 雪かきのポイント・評価・再会・はじめてのボーナスの合計(スコップ計は入れない)。 */
  readonly total: number;
  /** スコップ計ですくった回数(表示だけ。ポイントには入れない)。mine = 自分、total = 参加者みんなの合計。 */
  readonly scoops: { readonly mine: number; readonly total: number };
};

export function pointsForRequest(
  request: HelpRequest,
  userId: string,
  finished: readonly HelpRequest[],
  referrals: readonly Referral[],
): RequestPoints {
  const workPoints = request.status === "done" ? (request.result?.workPoints ?? 0) : 0;
  const stars = request.ratings?.[userId] ?? null;
  const ratingPoints = stars === null ? 0 : calculateRatingPoints(stars);
  const partnerIds = reunionPartners(request, userId, finished);
  const partners = partnerIds.map((id) => findHelper(request, id)?.displayName ?? "名無し");
  const reunionPoints = partnerIds.length * REUNION_POINTS_PER_PARTNER;
  const firstFinishBonus = referrals
    .filter((r) => r.inviteeUserId === userId)
    .flatMap((r) => recruitAwards(r, finished))
    .filter((a) => a.kind === "firstFinish" && a.requestId === request.id)
    .reduce((sum, a) => sum + a.points, 0);
  return {
    workPoints,
    stars,
    ratingPoints,
    reunion: { points: reunionPoints, partners },
    firstFinishBonus,
    total: workPoints + ratingPoints + reunionPoints + firstFinishBonus,
    scoops: {
      mine: findHelper(request, userId)?.scoops ?? 0,
      total: request.helpers.reduce((sum, h) => sum + (h.scoops ?? 0), 0),
    },
  };
}
