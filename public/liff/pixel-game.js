// 雪かき中のドット絵ゲーム(pixel-snow.js)で使う「計算だけ」の部品。
// ブラウザの機能(document・window など)は使わないので、テストからそのまま読み込める。
// タップの回数は見た目の楽しさだけに使い、スコアやサーバーには送らない。

const MS_PER_MINUTE = 60_000;

/** 雪かきレベルが 1 つ上がる分数と、いちばん上のレベル。 */
export const MINUTES_PER_LEVEL = 5;
export const MAX_LEVEL = 9;

/** 玄関前の雪の山が減りきるまでの分数と、最後に残る割合(0〜1)。 */
export const PILE_CLEAR_MINUTES = 30;
export const PILE_MIN_REMAINING = 0.12;

/** 最後のタップから、コンボが減り始めるまでの時間と、そのあと 1 つ減る間隔。 */
export const COMBO_GRACE_MS = 1200;
export const COMBO_DECAY_STEP_MS = 300;

/** マガンの群れの数(レベルが上がるほど仲間が増える)。 */
export const FLOCK_MIN_SIZE = 3;
export const FLOCK_MAX_SIZE = 9;

const pad = (n) => String(n).padStart(2, "0");
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const minutesOf = (elapsedMs) => Math.max(0, elapsedMs) / MS_PER_MINUTE;

/** 経過時間を「時:分:秒」か「分:秒」の形にする。 */
export function formatElapsed(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

/** 経過時間から雪かきレベル(1〜MAX_LEVEL)を出す。 */
export function digLevel(elapsedMs) {
  return Math.min(MAX_LEVEL, 1 + Math.floor(minutesOf(elapsedMs) / MINUTES_PER_LEVEL));
}

/** 次のレベルまでの進み具合(0〜1)。いちばん上のレベルでは 1。 */
export function levelProgress(elapsedMs) {
  if (digLevel(elapsedMs) >= MAX_LEVEL) return 1;
  return (minutesOf(elapsedMs) % MINUTES_PER_LEVEL) / MINUTES_PER_LEVEL;
}

/** 玄関前に残っている雪の割合(1 = 山盛り → PILE_MIN_REMAINING)。経過時間でだんだん減る。 */
export function pileRemaining(elapsedMs) {
  const ratio = clamp(minutesOf(elapsedMs) / PILE_CLEAR_MINUTES, 0, 1);
  return 1 - (1 - PILE_MIN_REMAINING) * ratio;
}

/** はじめのコンボの状態(まだタップしていない)。 */
export const EMPTY_COMBO = Object.freeze({ count: 0, lastTapAt: Number.NEGATIVE_INFINITY });

/**
 * 時刻 now でのコンボの数。最後のタップから COMBO_GRACE_MS までは保ち、
 * そのあとは COMBO_DECAY_STEP_MS ごとに 1 つずつ減っていく(0 より下にはならない)。
 */
export function comboAt(state, now) {
  const idleMs = now - state.lastTapAt - COMBO_GRACE_MS;
  if (idleMs <= 0) return state.count;
  return Math.max(0, state.count - Math.floor(idleMs / COMBO_DECAY_STEP_MS));
}

/** タップしたあとの新しいコンボの状態を返す(元の状態は変えない)。 */
export function registerTap(state, now) {
  return Object.freeze({ count: comboAt(state, now) + 1, lastTapAt: now });
}

/** コンボの節目で出す声(なければ null)。10 で COOL!、20 で GREAT!、30 からは 10 ごとに SUPER!。 */
export function cheerFor(combo) {
  if (combo === 10) return "COOL!";
  if (combo === 20) return "GREAT!";
  if (combo >= 30 && combo % 10 === 0) return "SUPER!";
  return null;
}

/** レベルに合わせたマガンの群れの数(レベルが上がるほど仲間が増える)。 */
export function flockSize(level) {
  return clamp(FLOCK_MIN_SIZE + Math.max(0, level - 1), FLOCK_MIN_SIZE, FLOCK_MAX_SIZE);
}

/** 決まった並びの乱数(0 以上 1 未満)を返す関数を作る。同じ seed なら毎回同じ並び(星や山の形に使う)。 */
export function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
