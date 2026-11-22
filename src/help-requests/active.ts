/**
 * 若者が「いま参加している雪かき」を選ぶ(画面を閉じたあと、続きに戻るため)。
 * - 参加中(accepted)と雪かき中(working)の依頼
 * - 終わってから ACTIVE_DONE_WINDOW_MS 以内の done(お疲れ様の画面をまだ見ていないかもしれないので)
 * 取り消し(cancelled)・募集中(waiting)・他人の依頼は返さない。
 */
import { findHelper } from "./model.js";
import type { HelpRequest, HelpRequestStatus } from "./model.js";

/** 終わった依頼を「続き」として返す時間(1 時間)。 */
export const ACTIVE_DONE_WINDOW_MS = 60 * 60 * 1000;

/** 保存先から読む状態(この中から絞り込む)。 */
export const ACTIVE_CANDIDATE_STATUSES: readonly HelpRequestStatus[] = ["accepted", "working", "done"];

const isOngoing = (r: HelpRequest): boolean => r.status === "accepted" || r.status === "working";

function isRecentlyDone(r: HelpRequest, now: Date): boolean {
  if (r.status !== "done" || !r.finishedAt) return false;
  const elapsedMs = now.getTime() - new Date(r.finishedAt).getTime();
  return elapsedMs >= 0 && elapsedMs <= ACTIVE_DONE_WINDOW_MS;
}

/** userId の人にとって、続きに戻るべき依頼か。 */
export function isActiveFor(r: HelpRequest, userId: string, now: Date): boolean {
  if (!findHelper(r, userId)) return false;
  return isOngoing(r) || isRecentlyDone(r, now);
}

const joinedAtOf = (r: HelpRequest, userId: string): string => findHelper(r, userId)?.joinedAt ?? "";

/**
 * いま参加している雪かきを 1 つ選ぶ。なければ null。
 * 続いているもの(参加中・雪かき中)を優先し、その中では最後に参加したもの。
 * 続いているものがなければ、いちばん最近終わったもの。
 */
export function findActiveFor(
  requests: readonly HelpRequest[],
  userId: string,
  now: Date,
): HelpRequest | null {
  const active = requests.filter((r) => isActiveFor(r, userId, now));
  const ongoing = active
    .filter(isOngoing)
    .sort((a, b) => joinedAtOf(b, userId).localeCompare(joinedAtOf(a, userId)));
  if (ongoing.length > 0) return ongoing[0] ?? null;
  const done = [...active].sort((a, b) => (b.finishedAt ?? "").localeCompare(a.finishedAt ?? ""));
  return done[0] ?? null;
}
