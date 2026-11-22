// 雪かき中のドット絵で、いっしょに雪かきする人(参加者)を並べるための「計算だけ」の部品。
// ブラウザの機能は使わないので、テストからそのまま読み込める。
//
// 並べ方のルール:
// - 参加した順(helpers の順)に、左右へ交互に置く。0 人目 = 左の内側、1 人目 = 右の内側、
//   2 人目 = 左の外側、3 人目 = 右の外側、4 人目 = 左のさらに外側…と外へ広がる
// - 左の人は右向き(画像のまま)、右の人は左向き(左右反転)。全員が真ん中の雪の山を向く
// - 人が多いほど少し小さくする。外側(奥)の人ほど少し小さく、少し上に置いて奥行きを出す

/** いっしょに雪かきできる人数の上限(定員)。 */
export const MAX_CREW = 5;

/** 人数ごとの、いちばん内側の人の高さ(画面の高さに対する割合)。1〜5 人。 */
export const HEIGHT_RATIO_BY_COUNT = Object.freeze([0.4, 0.4, 0.36, 0.36, 0.33]);
/** 外側(奥)へ 1 つ行くごとに小さくする割合と、上へずらすドット数。 */
export const DEPTH_SCALE_STEP = 0.1;
export const DEPTH_RISE = 12;
/** 真ん中から内側の人の体までの距離(内側の人の幅に対する割合)と、外側へ 1 人ぶんの間隔(その人の幅に対する割合)。 */
export const INNER_GAP_RATIO = 0.58;
export const SPACING_RATIO = 0.55;
/** コマの中での体の真ん中の位置(左はしからの割合。右向きのとき)。 */
export const BODY_ANCHOR = 0.4;
/** 人ごとにコマの始まりをずらす時間。 */
export const FRAME_OFFSET_STEP_MS = 470;
/** 名前を短くするときの文字数。 */
export const NAME_MAX_LENGTH = 6;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** index 人目(0 から)が、左右どちらの、内側から何番目(0 から)か。向きは真ん中向き。 */
export function crewSlot(index) {
  const side = index % 2 === 0 ? "left" : "right";
  return { side, rank: Math.floor(index / 2), isFlipped: side === "right" };
}

/**
 * count 人を並べたときの、1 人ずつの位置と大きさ(すべて整数のドット)。
 * - left/top: コマの左上、width/height: コマの大きさ、bodyX: 体の真ん中、feetY: 足の下端
 * @param {number} count 人数(1〜MAX_CREW にそろえる)
 * @param {{ sceneHeight: number, centerX: number, feetY: number, frameAspect: number }} scene
 *   frameAspect = コマの幅 ÷ 高さ
 */
export function crewLayout(count, { sceneHeight, centerX, feetY, frameAspect }) {
  const total = clamp(Math.round(count), 1, MAX_CREW);
  const baseHeight = sceneHeight * HEIGHT_RATIO_BY_COUNT[total - 1];
  const sizeAt = (rank) => {
    const height = baseHeight * (1 - DEPTH_SCALE_STEP * rank);
    return { height, width: height * frameAspect };
  };
  /** 真ん中から、内側から rank 番目の人の体までの距離。 */
  const offsetAt = (rank) =>
    Array.from({ length: rank }, (_, k) => sizeAt(k + 1).width * SPACING_RATIO).reduce(
      (sum, step) => sum + step,
      sizeAt(0).width * INNER_GAP_RATIO,
    );
  return Array.from({ length: total }, (_, index) => {
    const slot = crewSlot(index);
    const { width, height } = sizeAt(slot.rank);
    const direction = slot.side === "left" ? -1 : 1;
    const bodyX = centerX + direction * offsetAt(slot.rank);
    const anchor = slot.isFlipped ? 1 - BODY_ANCHOR : BODY_ANCHOR;
    const bottom = feetY - DEPTH_RISE * slot.rank;
    return {
      index,
      ...slot,
      width: Math.round(width),
      height: Math.round(height),
      left: Math.round(bodyX - anchor * width),
      top: Math.round(bottom - height),
      bodyX: Math.round(bodyX),
      feetY: Math.round(bottom),
    };
  });
}

/** index 人目のコマの始まりをずらす時間(同じコマで動かないように)。cycleMs でひと回り。 */
export const crewFrameOffset = (index, cycleMs) => (index * FRAME_OFFSET_STEP_MS) % cycleMs;

/** 名前を頭の上に出せる長さにする(長ければ切って「…」)。空なら「なかま」。 */
export function shortName(name, maxLength = NAME_MAX_LENGTH) {
  const chars = [...String(name ?? "").trim()];
  if (chars.length === 0) return "なかま";
  return chars.length > maxLength ? `${chars.slice(0, maxLength - 1).join("")}…` : chars.join("");
}

/** a から b へ、t(0〜1)だけ進んだ値。 */
export const lerp = (a, b, t) => a + (b - a) * clamp(t, 0, 1);

/** はじめ速く、終わりゆっくりの進み方(0〜1)。 */
export const easeOut = (t) => 1 - (1 - clamp(t, 0, 1)) ** 3;
