/**
 * 再会ボーナスと勧誘ポイントの判定(純粋関数)。値は score.ts。
 * - 再会ボーナス: 終わった依頼で、「前の別の依頼(done)でも一緒だった参加者」が今回もいたら、
 *   その人 1 人につき +150(依頼ごと)
 * - 勧誘ポイント: 招待リンクから来た人が「初めて雪かきを終えた」とき、誘った人に +500(1 人につき 1 回)、
 *   誘われた人にも「はじめての雪かき」+200。
 *   招待を記録する前に、もう雪かきを終えたことがある人では入らない(「初めて」ではないため)
 */
import type { Referral } from "../invites/model.js";
import { findHelper } from "./model.js";
import type { HelpRequest } from "./model.js";
import { FIRST_FINISH_BONUS_POINTS, RECRUIT_POINTS } from "./score.js";

type FinishedRequest = HelpRequest & { readonly finishedAt: string };

const isFinished = (r: HelpRequest): r is FinishedRequest => r.status === "done" && r.finishedAt !== null;

const byFinishedAt = (a: FinishedRequest, b: FinishedRequest): number => a.finishedAt.localeCompare(b.finishedAt);

/**
 * request の中で、userId と「前の別の依頼(done)でも一緒だった」参加者のユーザー ID(参加した順)。
 * userId が参加していない・request が終わっていなければ空。
 */
export function reunionPartners(
  request: HelpRequest,
  userId: string,
  finished: readonly HelpRequest[],
): readonly string[] {
  if (!isFinished(request) || !findHelper(request, userId)) return [];
  const earlierWithMe = finished
    .filter(isFinished)
    .filter((r) => r.id !== request.id && r.finishedAt < request.finishedAt && findHelper(r, userId));
  return request.helpers
    .map((h) => h.userId)
    .filter((id) => id !== userId && earlierWithMe.some((r) => findHelper(r, id)));
}

/** その人が若者として初めて終えた依頼。まだなければ null。 */
export function firstFinishOf(userId: string, finished: readonly HelpRequest[]): FinishedRequest | null {
  const mine = finished.filter(isFinished).filter((r) => findHelper(r, userId));
  return [...mine].sort(byFinishedAt)[0] ?? null;
}

/** 勧誘で入るポイント 1 つ分。 */
export type RecruitAward = {
  readonly userId: string;
  readonly points: number;
  readonly at: string;
  /** recruit = 誘った人に入る勧誘ポイント、firstFinish = 誘われた人のはじめての雪かきボーナス。 */
  readonly kind: "recruit" | "firstFinish";
  readonly requestId: string;
};

/**
 * 招待の記録 1 件から入るポイント。誘われた人がまだ雪かきを終えていない、
 * または招待を記録する前に終えていた(初めてではない)ときは空。
 */
export function recruitAwards(referral: Referral, finished: readonly HelpRequest[]): readonly RecruitAward[] {
  const first = firstFinishOf(referral.inviteeUserId, finished);
  if (!first || first.finishedAt < referral.createdAt) return [];
  const at = first.finishedAt;
  return [
    { userId: referral.inviterUserId, points: RECRUIT_POINTS, at, kind: "recruit", requestId: first.id },
    {
      userId: referral.inviteeUserId,
      points: FIRST_FINISH_BONUS_POINTS,
      at,
      kind: "firstFinish",
      requestId: first.id,
    },
  ];
}
