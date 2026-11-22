/**
 * 仲間ゲージ(美唄の仲間を 2 倍に)の集計(純粋関数)。
 * 仲間 = シーズン開始時の仲間(COMMUNITY_BASELINE)+ 終わった依頼(done)に新しく関わった人
 *        (依頼したお年寄り + 参加した若者。同じ人は 1 人と数える)。
 * 目標 = シーズン開始時の仲間の数(COMMUNITY_BASELINE)× 2。
 */
import type { HelpRequest } from "./model.js";

/** シーズン開始時の仲間の数(仮の値)。 */
export const COMMUNITY_BASELINE = 10;
/** 目標は開始時の何倍か。 */
export const COMMUNITY_GOAL_MULTIPLIER = 2;

export type CommunityGauge = {
  readonly members: number;
  readonly goal: number;
  readonly baseline: number;
};

const peopleOf = (r: HelpRequest): readonly string[] => [r.userId, ...r.helpers.map((h) => h.userId)];

export function countCommunity(requests: readonly HelpRequest[]): CommunityGauge {
  const members = new Set(requests.filter((r) => r.status === "done").flatMap(peopleOf));
  return {
    members: COMMUNITY_BASELINE + members.size,
    goal: COMMUNITY_BASELINE * COMMUNITY_GOAL_MULTIPLIER,
    baseline: COMMUNITY_BASELINE,
  };
}
