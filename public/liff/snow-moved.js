// 【若者】雪かき中の「動かした雪」と「音の実況」の決まり(純粋関数。画面やブラウザの機能は使わない)。
// - 雪の総量は分からない(目安しかない)ので、「あと少し」のような残りやゴールは言わない。
//   代わりに「どれだけ動かしたか」(スコップ計の回数 × 1 杯の重さ)を、身近な物のたとえで伝える
// - 実況のことばは「回数が節目を超えた瞬間」だけ。同時に複数の節目を超えたら、いちばん大事な 1 つだけ
//   (たとえの重さを超えた > みんなで 50 杯ごと > 自分の 10 杯ごと)
// 画面への表示・音・読み上げは moved-meter.js と sound-coach.js。

import { scoopKg } from "./scoop-counter.js";

/** 自分の回数を読み上げる間隔(杯)。 */
export const MINE_STEP = 10;
/** みんなの回数を読み上げる間隔(杯)。 */
export const TEAM_STEP = 50;

/** 動かした雪の重さのたとえ(軽い順)。重さはだいたいの目安。 */
export const COMPARISONS = Object.freeze([
  { kg: 100, label: "お米 10 袋ぶん" },
  { kg: 300, label: "グランドピアノ 1 台ぶん" },
  { kg: 700, label: "軽自動車 1 台ぶん" },
  { kg: 1500, label: "ふつうの車 1 台ぶん" },
]);

/**
 * みんなのすくった回数。ほかの人はサーバーの回数、自分は端末の回数(サーバーより少なければサーバーの回数)。
 * @param {ReadonlyArray<{ userId: string, scoops?: number }>} helpers
 * @param {string} myUserId
 * @param {number} myCount
 * @returns {number}
 */
export function teamScoops(helpers, myUserId, myCount) {
  const others = helpers
    .filter((helper) => helper.userId !== myUserId)
    .reduce((sum, helper) => sum + (helper.scoops ?? 0), 0);
  const myServerCount = helpers.find((helper) => helper.userId === myUserId)?.scoops ?? 0;
  return others + Math.max(myCount, myServerCount);
}

/**
 * 動かした重さが届いた中で、いちばん大きいたとえ。どれにも届いていなければ null。
 * @param {number} kg
 * @returns {{ kg: number, label: string } | null}
 */
export function comparisonFor(kg) {
  return [...COMPARISONS].reverse().find((c) => kg >= c.kg) ?? null;
}

/** 回数が step の倍数をまたいだら、そのいちばん大きい倍数。またいでいなければ null。 */
function crossedStep(before, after, step) {
  const reached = Math.floor(after / step) * step;
  return after > before && reached > before && reached > 0 ? reached : null;
}

/**
 * 回数が変わったときの実況のことば。言うことがなければ null。
 * @param {{ mine: number, team: number }} prev 前の回数(自分・みんな)
 * @param {{ mine: number, team: number }} next 今の回数
 * @returns {{ kind: "milestone" | "team" | "mine", text: string } | null}
 */
export function announcementFor(prev, next) {
  const before = comparisonFor(scoopKg(prev.team));
  const after = comparisonFor(scoopKg(next.team));
  if (after && after !== before) return { kind: "milestone", text: `みんなで${after.label}の雪を動かしました!` };
  const team = crossedStep(prev.team, next.team, TEAM_STEP);
  if (team !== null) return { kind: "team", text: `みんなで${team}杯、約${scoopKg(team)}キロ動かしました!` };
  const mine = crossedStep(prev.mine, next.mine, MINE_STEP);
  if (mine !== null) return { kind: "mine", text: `${mine}杯!約${scoopKg(mine)}キロ動かしました` };
  return null;
}
