/**
 * スコア・消費カロリー・雪の重さの計算(純粋関数 = 同じ入力なら必ず同じ答え)。
 * 値はすべて仮。遊んでみて調整する(docs/features/03-go-help.md, 04-ranking.md)。
 */

/** 作業 1 分あたりのポイント。 */
export const POINTS_PER_MINUTE = 100;
/** 雪 1 kg あたりのポイント。 */
export const POINTS_PER_SNOW_KG = 10;
/** 星 1 つあたりのポイント(いいねのときに加算)。 */
export const POINTS_PER_STAR = 100;
/** 新雪の重さの目安(kg/㎥)。 */
export const SNOW_DENSITY_KG_PER_M3 = 100;
/** 積雪の深さが取れなかったときに使う値(m)。 */
export const DEFAULT_SNOW_DEPTH_M = 0.3;
/** 雪かきの運動の強さ(METs)と、体重が分からないときの体重(kg)。 */
export const SNOW_SHOVELING_METS = 5.5;
export const DEFAULT_BODY_WEIGHT_KG = 60;
const CALORIE_FACTOR = 1.05;
const MINUTES_PER_HOUR = 60;
const MS_PER_MINUTE = 60_000;

const roundTo = (value: number, digits: number): number => {
  const base = 10 ** digits;
  return Math.round(value * base) / base;
};

/** 開始から終了までの分数(小数第 1 位まで)。時刻が逆なら 0。 */
export function elapsedMinutes(startedAt: string, finishedAt: Date): number {
  const ms = finishedAt.getTime() - new Date(startedAt).getTime();
  return Math.max(0, roundTo(ms / MS_PER_MINUTE, 1));
}

/** 雪の重さ(kg)= 面積(㎡)× 積雪の深さ(m)× 100。 */
export function calculateSnowKg(areaM2: number, snowDepthM: number): number {
  return roundTo(areaM2 * snowDepthM * SNOW_DENSITY_KG_PER_M3, 1);
}

/** 消費カロリー(kcal)= 5.5(METs)× 60kg × 時間(h)× 1.05。 */
export function calculateCalories(minutes: number): number {
  const hours = minutes / MINUTES_PER_HOUR;
  return Math.round(SNOW_SHOVELING_METS * DEFAULT_BODY_WEIGHT_KG * hours * CALORIE_FACTOR);
}

/** 雪かきのポイント = 作業分数 × 100 + 雪の重さ kg × 10。 */
export function calculateWorkPoints(minutes: number, snowKg: number): number {
  return Math.round(minutes * POINTS_PER_MINUTE + snowKg * POINTS_PER_SNOW_KG);
}

/** 評価のポイント = 星 × 100。 */
export function calculateRatingPoints(stars: number): number {
  return stars * POINTS_PER_STAR;
}
