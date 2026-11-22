// 地図の上の形の計算(純粋関数)。画面からもテストからも使う。
// 点は { lat: 緯度, lng: 経度 }。点の配列は変えず、いつも新しい配列を返す。

/** 地球の半径(m)。 */
const EARTH_RADIUS_M = 6_371_008.8;
const toRadians = (degrees) => (degrees * Math.PI) / 180;
/** 緯度 1 度あたりの長さ(m)。 */
const METERS_PER_DEGREE_LAT = toRadians(1) * EARTH_RADIUS_M;
/** その緯度での、経度 1 度あたりの長さ(m)。 */
const metersPerDegreeLng = (lat) => METERS_PER_DEGREE_LAT * Math.cos(toRadians(lat));

/**
 * 多角形(点を順につないで最後に最初へ戻る形)の面積(㎡)。
 * 雪かきの範囲くらいの狭さなら平らとみなせるので、真ん中の緯度で m に直してから
 * 「靴ひもの公式」(座標から多角形の面積を出す公式)で計算する。点が 3 つ未満なら 0。
 * @param {ReadonlyArray<{ lat: number, lng: number }>} points
 * @returns {number}
 */
export function polygonAreaM2(points) {
  if (points.length < 3) return 0;
  const meanLat = points.reduce((sum, p) => sum + p.lat, 0) / points.length;
  const lngScale = metersPerDegreeLng(meanLat);
  const xy = points.map((p) => ({ x: p.lng * lngScale, y: p.lat * METERS_PER_DEGREE_LAT }));
  const twiceArea = xy.reduce((sum, p, i) => {
    const next = xy[(i + 1) % xy.length];
    return sum + (p.x * next.y - next.x * p.y);
  }, 0);
  return Math.abs(twiceArea) / 2;
}

/**
 * center を真ん中にした、1 辺 sizeM(m)の四角形の 4 つの角(左下 → 右下 → 右上 → 左上)。
 * @param {{ lat: number, lng: number }} center
 * @param {number} sizeM
 */
export function squareAround(center, sizeM) {
  const dLat = sizeM / 2 / METERS_PER_DEGREE_LAT;
  const dLng = sizeM / 2 / metersPerDegreeLng(center.lat);
  return [
    { lat: center.lat - dLat, lng: center.lng - dLng },
    { lat: center.lat - dLat, lng: center.lng + dLng },
    { lat: center.lat + dLat, lng: center.lng + dLng },
    { lat: center.lat + dLat, lng: center.lng - dLng },
  ];
}

/** 2 点の真ん中。 */
export const midpoint = (a, b) => ({ lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 });

/**
 * 辺の真ん中(つまみを置く場所)の一覧。insertAt は、そこに点を足すときに差し込む位置。
 * 3 点以上なら最後の点から最初の点へ戻る辺も含む。2 点なら 1 本、1 点以下なら空。
 * @param {ReadonlyArray<{ lat: number, lng: number }>} points
 * @returns {Array<{ insertAt: number, point: { lat: number, lng: number } }>}
 */
export function edgeMidpoints(points) {
  if (points.length < 2) return [];
  const edgeCount = points.length === 2 ? 1 : points.length;
  return Array.from({ length: edgeCount }, (_, i) => ({
    insertAt: i + 1,
    point: midpoint(points[i], points[(i + 1) % points.length]),
  }));
}

/** index の位置に point を差し込んだ新しい配列。 */
export const insertPointAt = (points, index, point) => [
  ...points.slice(0, index),
  point,
  ...points.slice(index),
];

/** index の点を point に動かした新しい配列。 */
export const movePointAt = (points, index, point) => points.map((p, i) => (i === index ? point : p));

/** index の点を除いた新しい配列。 */
export const removePointAt = (points, index) => points.filter((_, i) => i !== index);
