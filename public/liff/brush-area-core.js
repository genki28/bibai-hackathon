// 【若者】範囲の記録の「筆で塗る」の計算(純粋関数。画面やブラウザの機能は使わない)。画面は brush-area.js。
// - 筆の線は、家を原点にした m の座標(東 = x、北 = y)で持つ
// - 面積は、塗ったところを 50cm のマス目に分けて、塗られたマスを数える(重ね塗りしても増えない)

/** 面積を数えるマス目の 1 辺(m)。細かいほど正確だが、計算が重くなる。 */
export const CELL_M = 0.5;
const EARTH_RADIUS_M = 6_371_000;
const DEG = Math.PI / 180;

/**
 * 緯度経度 → origin(家)からの m。狭い範囲なので、平らな地面とみなしてよい。
 * @param {{ lat: number, lng: number }} point
 * @param {{ lat: number, lng: number }} origin
 * @returns {{ x: number, y: number }} x = 東へ(m)、y = 北へ(m)
 */
export function toLocalMeters(point, origin) {
  const x = (point.lng - origin.lng) * DEG * EARTH_RADIUS_M * Math.cos(origin.lat * DEG);
  const y = (point.lat - origin.lat) * DEG * EARTH_RADIUS_M;
  return { x: x + 0, y: y + 0 };
}

/** 点 p から、線分 a-b までのいちばん近い距離。 */
function distanceToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** 1 本の線分(太さ widthM)が塗るマスを、cells に足す。 */
function paintSegment(cells, a, b, widthM) {
  const radius = widthM / 2;
  const minX = Math.floor((Math.min(a.x, b.x) - radius) / CELL_M);
  const maxX = Math.ceil((Math.max(a.x, b.x) + radius) / CELL_M);
  const minY = Math.floor((Math.min(a.y, b.y) - radius) / CELL_M);
  const maxY = Math.ceil((Math.max(a.y, b.y) + radius) / CELL_M);
  for (let i = minX; i <= maxX; i += 1) {
    for (let j = minY; j <= maxY; j += 1) {
      // マスの真ん中が筆の中なら、そのマスは塗られたとする
      const center = { x: (i + 0.5) * CELL_M, y: (j + 0.5) * CELL_M };
      if (distanceToSegment(center, a, b) <= radius) cells.add(`${i},${j}`);
    }
  }
}

/**
 * 筆で塗った面積(㎡)。
 * @param {ReadonlyArray<{ widthM: number, points: ReadonlyArray<{ x: number, y: number }> }>} strokes
 * @returns {number}
 */
export function paintedAreaM2(strokes) {
  const cells = new Set();
  strokes.forEach(({ widthM, points }) => {
    if (points.length === 1) paintSegment(cells, points[0], points[0], widthM);
    for (let k = 1; k < points.length; k += 1) paintSegment(cells, points[k - 1], points[k], widthM);
  });
  return cells.size * CELL_M * CELL_M;
}
