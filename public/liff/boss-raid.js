// 【若者】雪かき中の「雪山ボス」と「音の実況」の決まり(純粋関数。画面やブラウザの機能は使わない)。
// - ボスの体力 = 雪の多さごとの体力 × 参加人数。みんなのスコップ計の回数(すくった回数)で減っていく
// - 実況のことばは「回数が節目を超えた瞬間」だけ出す。同時に複数の節目を超えたら、いちばん大事な 1 つだけ
//   (倒した > ボスの体力 > みんなで 50 杯ごと > 自分の 10 杯ごと)
// 画面への表示・音・読み上げは raid.js と sound-coach.js。

import { scoopKg } from "./scoop-counter.js";

/** 参加者 1 人あたりのボスの体力(すくう回数)。雪が多いほど強い。 */
export const BOSS_HP_PER_HELPER = Object.freeze({ little: 30, normal: 60, lots: 100 });
/** 自分の回数を読み上げる間隔(杯)。 */
export const MINE_STEP = 10;
/** みんなの回数を読み上げる間隔(杯)。 */
export const TEAM_STEP = 50;

/** ボスの体力の節目(減った割合)と、そのときのことば。大きい順に調べる。 */
const BOSS_MILESTONES = Object.freeze([
  { ratio: 0.75, text: "ボス、あと少し!" },
  { ratio: 0.5, text: "ボスの体力、あと半分!" },
  { ratio: 0.25, text: "ボスがひるんだ!" },
]);

/**
 * ボスの最大の体力。
 * @param {string} amount 雪の多さ(little / normal / lots)
 * @param {number} helperCount 参加人数
 * @returns {number}
 */
export function bossMaxHp(amount, helperCount) {
  const perHelper = BOSS_HP_PER_HELPER[amount] ?? BOSS_HP_PER_HELPER.normal;
  return perHelper * Math.max(1, Math.floor(helperCount) || 0);
}

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
 * ボスの残り体力。
 * @param {number} total みんなのすくった回数
 * @param {number} maxHp
 * @returns {{ hp: number, maxHp: number, ratio: number, isDefeated: boolean }} ratio は残りの割合(1 = 満タン)
 */
export function bossView(total, maxHp) {
  const hp = Math.max(0, maxHp - total);
  return { hp, maxHp, ratio: maxHp > 0 ? hp / maxHp : 0, isDefeated: hp === 0 };
}

/** 回数が step の倍数をまたいだら、そのいちばん大きい倍数。またいでいなければ null。 */
function crossedStep(before, after, step) {
  const reached = Math.floor(after / step) * step;
  return after > before && reached > before && reached > 0 ? reached : null;
}

/** 減った割合(0〜1)。 */
const damageOf = (point) => (point.maxHp > 0 ? point.team / point.maxHp : 1);

/** ボスのことば(倒した / 節目)。なければ null。 */
function bossAnnouncement(prev, next) {
  const before = damageOf(prev);
  const after = damageOf(next);
  if (before >= 1 || after <= before) return null;
  if (after >= 1) return { kind: "defeat", text: `雪山ボスを倒した!みんなで${next.team}杯!` };
  const milestone = BOSS_MILESTONES.find((m) => before < m.ratio && after >= m.ratio);
  return milestone ? { kind: "boss", text: milestone.text } : null;
}

/**
 * 回数が変わったときの実況のことば。言うことがなければ null。
 * @param {{ mine: number, team: number, maxHp: number }} prev 前の回数(自分・みんな)とボスの体力
 * @param {{ mine: number, team: number, maxHp: number }} next 今の回数とボスの体力
 * @returns {{ kind: "defeat" | "boss" | "team" | "mine", text: string } | null}
 */
export function announcementFor(prev, next) {
  const boss = bossAnnouncement(prev, next);
  if (boss) return boss;
  const team = crossedStep(prev.team, next.team, TEAM_STEP);
  if (team !== null) return { kind: "team", text: `みんなで${team}杯!` };
  const mine = crossedStep(prev.mine, next.mine, MINE_STEP);
  if (mine !== null) return { kind: "mine", text: `${mine}杯!約${scoopKg(mine)}キロ!` };
  return null;
}
