// 【試作】雪かきの前と後の写真から「除雪率」を出す計算(純粋関数。画面やブラウザの機能は使わない)。
// 1. 雪の部分を見つける: 写真の下のほう(地面)で、明るくて色の薄い点を雪とする。
//    明るさは「その写真のいちばん明るいあたり」と比べるので、夕方や日陰でもある程度そろう
// 2. 遠近の補正: 写真では、遠くの地面ほど小さく写る(同じ 1 点でも、遠いほど広い地面を表す)。
//    奥行きの AI(Depth Anything V2。値は近いほど大きい)の値から、遠い点ほど重く数える
// 3. 除雪率 = (前の雪の割合 − 後の雪の割合) ÷ 前の雪の割合
// 奥行きの AI の値は「相対的な奥行き」で、メートルではない。補正は目安(研究でもスケールを決めるには基準物が要る)。

/** 写真の上からこの割合より下を「地面」として見る(上のほうは空や建物が多い)。 */
export const GROUND_TOP = 0.4;
/** 地面の外の点の印。 */
export const NOT_GROUND = 2;
/** 雪とみなす明るさ(写真のいちばん明るいあたりに対する割合)と、色の薄さ(彩度)の上限。 */
const MIN_RELATIVE_BRIGHTNESS = 0.72;
const MAX_SATURATION = 0.25;
/** 真っ暗な写真で、暗い点を雪と取り違えないための明るさの下限(0〜255)。 */
const MIN_ABSOLUTE_BRIGHTNESS = 60;
/** 「いちばん明るいあたり」= 明るさの上から 5% の位置(白飛びや街灯に引っぱられないため)。 */
const REFERENCE_PERCENTILE = 0.95;
/** 遠近の補正で、いちばん遠い点を何倍まで重くするか(奥行きの値の下限 0.25 → 16 倍)。 */
const MIN_NORMALIZED_DEPTH = 0.25;
/** 奥行きをそろえるときに使う範囲(地面の点の、下から 5% 〜 上から 5%)。はずれ値に引っぱられないため。 */
const DEPTH_LOW_PERCENTILE = 0.05;
const DEPTH_HIGH_PERCENTILE = 0.95;

/** 見た目の明るさ(0〜255)。 */
const brightnessOf = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

/**
 * 雪の色か。
 * @param {number} r @param {number} g @param {number} b 0〜255
 * @param {number} reference その写真のいちばん明るいあたりの明るさ(0〜255)
 * @returns {boolean}
 */
export function isSnowColor(r, g, b, reference) {
  const max = Math.max(r, g, b);
  if (max === 0) return false;
  const saturation = (max - Math.min(r, g, b)) / max;
  const brightness = brightnessOf(r, g, b);
  return (
    brightness >= MIN_ABSOLUTE_BRIGHTNESS &&
    brightness >= reference * MIN_RELATIVE_BRIGHTNESS &&
    saturation <= MAX_SATURATION
  );
}

/** 地面の点の明るさのうち、上から 5% の値。 */
function referenceBrightness({ data, width, height }, groundStart) {
  const values = [];
  for (let i = groundStart * width; i < width * height; i += 1) {
    values.push(brightnessOf(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]));
  }
  if (values.length === 0) return 255;
  values.sort((a, b) => a - b);
  return values[Math.min(values.length - 1, Math.floor(values.length * REFERENCE_PERCENTILE))];
}

/**
 * 雪の部分の印。1 = 雪、0 = 地面だが雪ではない、NOT_GROUND = 地面の外(写真の上のほう)。
 * @param {{ data: Uint8ClampedArray, width: number, height: number }} image RGBA の画素
 * @returns {Uint8Array} 画素と同じ並び
 */
export function snowMaskOf(image) {
  const { data, width, height } = image;
  const groundStart = Math.floor(height * GROUND_TOP);
  const reference = referenceBrightness(image, groundStart);
  const mask = new Uint8Array(width * height).fill(NOT_GROUND);
  for (let i = groundStart * width; i < width * height; i += 1) {
    mask[i] = isSnowColor(data[i * 4], data[i * 4 + 1], data[i * 4 + 2], reference) ? 1 : 0;
  }
  return mask;
}

/** 地面の点の奥行きの、下から 5% と上から 5% の値。 */
function depthRange(depth, mask) {
  const values = [];
  for (let i = 0; i < depth.length; i += 1) {
    if (!mask || mask[i] !== NOT_GROUND) values.push(depth[i]);
  }
  if (values.length === 0) return { min: 0, max: 0 };
  values.sort((a, b) => a - b);
  const at = (ratio) => values[Math.min(values.length - 1, Math.floor(values.length * ratio))];
  return { min: at(DEPTH_LOW_PERCENTILE), max: at(DEPTH_HIGH_PERCENTILE) };
}

/**
 * 遠近の補正の重み。遠い点(奥行きの値が小さい)ほど重い。重み = 1 ÷ (0〜1 にそろえた奥行き)²。
 * 写真に写る地面の広さは、距離の 2 乗に比例して広がるため。
 * 奥行きのそろえ方は地面の点だけで決める(空や建物は、遠すぎて重みが極端になるため)。
 * @param {ArrayLike<number>} depth 奥行きの AI の値(近いほど大きい。単位なし)
 * @param {Uint8Array | null} [mask] snowMaskOf の結果。あれば地面の点だけで範囲を決める
 * @returns {Float32Array}
 */
export function footprintWeights(depth, mask = null) {
  const { min, max } = depthRange(depth, mask);
  const range = max - min;
  return Float32Array.from(depth, (d) => {
    if (!(range > 0)) return 1;
    const normalized = Math.min(1, Math.max(MIN_NORMALIZED_DEPTH, (d - min) / range));
    return 1 / (normalized * normalized);
  });
}

/**
 * 地面のうち、雪の割合(0〜1)。重みがあれば、重い点ほど効く。
 * @param {Uint8Array} mask snowMaskOf の結果
 * @param {ArrayLike<number> | null} [weights] footprintWeights の結果(同じ並び)
 * @returns {number}
 */
export function snowCoverage(mask, weights = null) {
  let snow = 0;
  let ground = 0;
  for (let i = 0; i < mask.length; i += 1) {
    if (mask[i] === NOT_GROUND) continue;
    const weight = weights ? weights[i] : 1;
    ground += weight;
    if (mask[i] === 1) snow += weight;
  }
  return ground > 0 ? snow / ground : 0;
}

/**
 * 除雪率(0〜1)。前の雪のうち、なくなった割合。
 * @param {number} before 前の写真の雪の割合
 * @param {number} after 後の写真の雪の割合
 * @returns {number}
 */
export function clearanceRate(before, after) {
  if (!(before > 0)) return 0;
  return Math.max(0, Math.min(1, (before - after) / before));
}
