// 地図の上の形の計算(純粋関数)。画面からもテストからも使う。
// 点は { lat: 緯度, lng: 経度 }。

/** 地球の半径(m)。 */
const EARTH_RADIUS_M = 6_371_008.8;
const toRadians = (degrees) => (degrees * Math.PI) / 180;

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
  const metersPerDegreeLat = toRadians(1) * EARTH_RADIUS_M;
  const metersPerDegreeLng = metersPerDegreeLat * Math.cos(toRadians(meanLat));
  const xy = points.map((p) => ({ x: p.lng * metersPerDegreeLng, y: p.lat * metersPerDegreeLat }));
  const twiceArea = xy.reduce((sum, p, i) => {
    const next = xy[(i + 1) % xy.length];
    return sum + (p.x * next.y - next.x * p.y);
  }, 0);
  return Math.abs(twiceArea) / 2;
}
