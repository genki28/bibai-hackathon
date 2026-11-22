/**
 * リーダーの決め方と、開始・終了をだれができるか(純粋関数)。
 * - 開始: 到着した参加者ならだれでも押せる
 * - 開始した瞬間に、その時点の参加者からランダムで 1 人をリーダーにする(到着済みの人を優先)。
 *   途中参加の人は、もうリーダーが決まっているのでリーダーにならない
 * - リーダーの役割は「雪かきを行った範囲に丸を付ける」ことだけ。終了(finish)できるのはリーダーだけ
 * 乱数(random)は差し替えられるので、テストでは決まった結果にできる。
 */
import type { Helper, HelpRequest } from "./model.js";

/** 0 以上 1 未満の数を返す関数(ふだんは Math.random)。 */
export type RandomSource = () => number;

/** リーダーの候補。到着した人がいればその人たち、いなければ参加者全員。 */
export function leaderCandidates(helpers: readonly Helper[]): readonly Helper[] {
  const arrived = helpers.filter((h) => h.arrivedAt !== null);
  return arrived.length > 0 ? arrived : helpers;
}

/** 候補の中からランダムに 1 人を選ぶ。参加者がいなければ null。 */
export function pickLeader(helpers: readonly Helper[], random: RandomSource): Helper | null {
  const candidates = leaderCandidates(helpers);
  if (candidates.length === 0) return null;
  const index = Math.min(candidates.length - 1, Math.max(0, Math.floor(random() * candidates.length)));
  return candidates[index] ?? null;
}

/** この人が開始を押せるか(参加していて、到着している)。 */
export function canStart(r: HelpRequest, userId: string): boolean {
  const helper = r.helpers.find((h) => h.userId === userId);
  return helper !== undefined && helper.arrivedAt !== null;
}

/**
 * この人が範囲に丸を付けて終了できるか(リーダーだけ)。
 * リーダーの列ができる前に始まった古い依頼(leaderUserId が null)は、参加者ならだれでも終われる。
 */
export function canFinish(r: HelpRequest, userId: string): boolean {
  const isHelper = r.helpers.some((h) => h.userId === userId);
  if (!isHelper) return false;
  return r.leaderUserId === null || r.leaderUserId === userId;
}
