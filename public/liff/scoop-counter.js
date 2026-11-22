// スコップ計の「数え方」(ブラウザに依存しない純粋関数)。スマホの加速度から、雪をすくった回数を数える。
// 1 サンプルずつ stepScoop で状態を進める(もとの状態は書き換えず、新しい状態を返す)。
// 数え方:
//   1. 重力を除いた加速度(acceleration)を使う。なければ accelerationIncludingGravity から、
//      ゆっくり追いかける平均(= 重力の向きと大きさ)を引いて、揺れの分だけにする
//   2. 揺れの大きさ √(x²+y²+z²) を、直近 SMOOTHING_SAMPLES 個の平均でなめらかにする
//   3. なめらかにした値が SCOOP_THRESHOLD を超えて山ができ、RELEASE_THRESHOLD より下がったら 1 回
//   4. 1 回数えたら MIN_SCOOP_INTERVAL_MS の間は数えない(同じ動きを 2 回数えない)
// しきい値は仮の値。実機(上着のポケット)で確かめて調整する。テストは tests/scoop-counter.test.ts。

/** 1 杯の重さ(kg)。仮の値(利用者と決めた 3.5kg)。 */
export const KG_PER_SCOOP = 3.5;
/** これを超えたら「すくう動きの山」が始まった(m/s²。重力を除いた揺れの大きさ)。 */
export const SCOOP_THRESHOLD = 6;
/** 山が始まったあと、これより下がったら 1 回と数える(行ったり来たりで何度も数えないように、少し下げる)。 */
export const RELEASE_THRESHOLD = 3;
/** 1 回数えたあと、次を数えない時間(ミリ秒)。 */
export const MIN_SCOOP_INTERVAL_MS = 700;
/** なめらかにするときに平均するサンプルの数(1 秒に 60 回なら約 0.08 秒ぶん)。 */
export const SMOOTHING_SAMPLES = 5;
/** 重力を追いかける速さ(ミリ秒)。大きいほどゆっくり追いかける。 */
export const GRAVITY_TIME_CONSTANT_MS = 1000;
/** サンプルがこれより長く途切れたら(スリープなど)、なめらかにする途中の値を捨ててやり直す。 */
export const GAP_RESET_MS = 1000;

/** はじめの状態(回数 0)。 */
export const EMPTY_SCOOP_STATE = Object.freeze({
  count: 0,
  lastT: null,
  gravity: null,
  recent: Object.freeze([]),
  isAbove: false,
  lastCountAt: null,
});

/** 回数だけ引き継いだ、はじめの状態(画面を開き直して、端末に覚えていた回数から続けるとき)。 */
export const scoopStateFrom = (count) => ({ ...EMPTY_SCOOP_STATE, count: Math.max(0, Math.floor(count) || 0) });

const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);
const magnitude = (v) => Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
const average = (values) => values.reduce((sum, v) => sum + v, 0) / values.length;

/** 重力の推定を 1 歩進める(ゆっくり追いかける平均)。 */
function nextGravity(gravity, sample, dt) {
  if (!gravity) return { x: sample.x, y: sample.y, z: sample.z };
  const alpha = 1 - Math.exp(-dt / GRAVITY_TIME_CONSTANT_MS);
  return {
    x: gravity.x + alpha * (sample.x - gravity.x),
    y: gravity.y + alpha * (sample.y - gravity.y),
    z: gravity.z + alpha * (sample.z - gravity.z),
  };
}

/**
 * 1 サンプルぶん状態を進める。
 * @param {typeof EMPTY_SCOOP_STATE} state いまの状態
 * @param {{ t: number, x: number, y: number, z: number, includesGravity?: boolean }} sample
 *   t は時刻(ミリ秒)。includesGravity が true なら x, y, z は重力込み(accelerationIncludingGravity)
 * @returns {typeof EMPTY_SCOOP_STATE} 新しい状態(サンプルがおかしければ、もとの状態のまま)
 */
export function stepScoop(state, sample) {
  if (![sample?.t, sample?.x, sample?.y, sample?.z].every(isFiniteNumber)) return state;
  const isGap = state.lastT === null || sample.t - state.lastT > GAP_RESET_MS || sample.t < state.lastT;
  // 途切れたあとは、回数と最後に数えた時刻だけ残してやり直す
  const base = isGap ? { ...scoopStateFrom(state.count), lastCountAt: state.lastCountAt } : state;
  const dt = isGap ? 0 : sample.t - state.lastT;
  const gravity = sample.includesGravity ? nextGravity(base.gravity, sample, dt) : null;
  const motion = gravity ? { x: sample.x - gravity.x, y: sample.y - gravity.y, z: sample.z - gravity.z } : sample;
  const recent = [...base.recent, magnitude(motion)].slice(-SMOOTHING_SAMPLES);
  const smoothed = average(recent);
  const next = { ...base, lastT: sample.t, gravity, recent };

  if (!base.isAbove) return smoothed > SCOOP_THRESHOLD ? { ...next, isAbove: true } : next;
  if (smoothed >= RELEASE_THRESHOLD) return next;
  // 山を越えて下がった。間が空いていれば 1 回と数える
  const isTooSoon = base.lastCountAt !== null && sample.t - base.lastCountAt < MIN_SCOOP_INTERVAL_MS;
  if (isTooSoon) return { ...next, isAbove: false };
  return { ...next, isAbove: false, count: base.count + 1, lastCountAt: sample.t };
}

/** サンプルの列をまとめて数える(テスト・確かめ用)。 */
export const countScoops = (samples, state = EMPTY_SCOOP_STATE) =>
  samples.reduce((current, sample) => stepScoop(current, sample), state).count;

/** すくった回数から、運んだ雪の重さ(kg。整数に丸める)。 */
export const scoopKg = (count) => Math.round(Math.max(0, count) * KG_PER_SCOOP);
