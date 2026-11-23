// 「美唄の雪山の地図」の、雪山の大きさ・形の計算(純粋な関数。画面やブラウザの機能は使わない)。
// - 雪かき 1 件 = 雪山 1 つ。高さはみんなの消費カロリーの合計 × METERS_PER_KCAL(400 kcal を超えたら伸びをゆるめる)
// - 形は Three.js の 3D の雪山(snow-mountain-3d.js)。ここでは大きさ・でこぼこ(ノイズ)・位置・押した雪山の選び方を計算する
// 画面は snow-map.js。テストは tests/snow-mountain.test.ts。

/** 1 kcal で何 m 高くするか(300 kcal ≒ 90m。町全体の地図でも見えるくらい)。 */
export const METERS_PER_KCAL = 0.3;
/** すその半径(m)と、カロリーが多いほど広がる量(√kcal に比例)。 */
const BASE_RADIUS_M = 70;
const RADIUS_PER_SQRT_KCAL = 2.2;
/** この kcal を超えたら、高さの伸びをゆるめる(まとめた大きな雪山が、塔ではなく山の形のままになるように)。 */
const STEEP_UNTIL_KCAL = 400;
const GENTLE_POWER = 0.7;
/** カロリーが 0 でも見えるようにする、最低の高さ(m)。 */
const MIN_HEIGHT_M = 6;
/** 1 つの雪山の上限(m・倍率をかける前)。まとめた大きな雪山が、美唄の町より大きくならないように。 */
export const MAX_RADIUS_M = 420;
export const MAX_HEIGHT_M = 460;
const METERS_PER_DEGREE = 111_320;

/** 引いて見たときに大きくし始めるズームと、1 段引くごとの倍率。 */
const SCALE_FROM_ZOOM = 14;
const SCALE_PER_ZOOM = 2;
/** このズームより引いたら、もう大きくしない(地図の方が小さくなり、雪山が美唄のあたりにあると分かる)。 */
export const MAX_SCALE_ZOOM = 11;

/**
 * 見た目の大きさの倍率。寄って見ると 1 倍、引くと大きく、MAX_SCALE_ZOOM より引いたらそこで止める。
 * @param {number} zoom 地図のズーム
 * @returns {number}
 */
export function viewScale(zoom) {
  const clamped = Math.max(MAX_SCALE_ZOOM, zoom);
  return Math.max(1, SCALE_PER_ZOOM ** (SCALE_FROM_ZOOM - clamped));
}

/**
 * 1 つの雪山の大きさ(m)。
 * @param {{ members: Array<{ calories: number }> }} pile
 * @param {number} [scale] 見た目の大きさの倍率(引いて見たときに大きくして、見えるようにする)
 * @returns {{ heightM: number, radiusM: number }}
 */
export function mountainSize(pile, scale = 1) {
  const total = pile.members.reduce((sum, m) => sum + Math.max(0, m.calories), 0);
  const effective = total <= STEEP_UNTIL_KCAL ? total : STEEP_UNTIL_KCAL + (total - STEEP_UNTIL_KCAL) ** GENTLE_POWER;
  const heightM = Math.min(MAX_HEIGHT_M, Math.max(MIN_HEIGHT_M, effective * METERS_PER_KCAL)) * scale;
  const radiusM = Math.min(MAX_RADIUS_M, BASE_RADIUS_M + Math.sqrt(total) * RADIUS_PER_SQRT_KCAL) * scale;
  return { heightM, radiusM };
}

/** 雪山の ID から、ノイズの種(0 以上の整数)を作る。同じ ID ならいつも同じ。 */
export function seedFromId(id) {
  let hash = 2166136261;
  for (const ch of String(id)) {
    hash = Math.imul(hash ^ ch.codePointAt(0), 16777619) >>> 0;
  }
  return hash;
}

/** 種から 0 以上 1 未満の数を作る(同じ種・同じ番号なら同じ数)。 */
export function seededUnit(seed, index) {
  const x = Math.sin(seed * 12.9898 + index * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * 雪山のでこぼこ(-1〜1)。角度 angle(ラジアン)と、真ん中からの割合 u(0〜1)で決まる、なめらかな値。
 * 種ごとに波の向き・ずれが変わるので、雪山ごとに違う形になる。
 */
export function snowNoise(seed, angle, u) {
  const phase = (i) => seededUnit(seed, i) * Math.PI * 2;
  const waves =
    0.5 * Math.sin(2 * angle + phase(1)) +
    0.3 * Math.sin(3 * angle + phase(2) + u * 2.5) +
    0.2 * Math.sin(5 * angle + phase(3) + u * 4);
  return Math.max(-1, Math.min(1, waves));
}

/**
 * 雪山の横から見た形: 真ん中からの割合 u(0〜1)での高さの割合(1〜0)。
 * てっぺんは丸く、すそは地面になめらかにつながる(すその広い雪山)。
 */
export function mountainProfile(u) {
  const t = Math.max(0, Math.min(1, u));
  return 1 - 3 * t * t + 2 * t * t * t;
}

/** 開いたときに下から育つ割合(0〜1。はじめ速く、最後はゆっくり止まる)。index 番目の雪山は staggerMs ずつ遅れて育つ。 */
export function growProgress(elapsedMs, index, growMs, staggerMs) {
  if (growMs <= 0) return 1;
  const t = Math.min(1, Math.max(0, (elapsedMs - index * staggerMs) / growMs));
  return 1 - (1 - t) ** 3;
}

/** 基準の点 origin から見た、point の位置(m。x = 東、y = 北。狭い範囲なので平らとみなす)。 */
export function toLocalMeters(origin, point) {
  const cos = Math.cos((origin.lat * Math.PI) / 180);
  return {
    x: (point.lng - origin.lng) * METERS_PER_DEGREE * cos,
    y: (point.lat - origin.lat) * METERS_PER_DEGREE,
  };
}

/** 点 p と、線分 a-b のいちばん近い距離。 */
function distanceToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * 画面で押した点に、いちばん近い雪山を選ぶ(なければ null)。
 * 雪山ごとに、画面の上の「ふもとの真ん中(base)」「てっぺん(peak)」と、画面の上での半径(radiusPx)を渡す。
 * ふもと〜てっぺんの線から radiusPx(最低 minPx)以内なら当たり。
 * @template T
 * @param {{ x: number, y: number }} point
 * @param {Array<{ item: T, base: { x: number, y: number }, peak: { x: number, y: number }, radiusPx: number }>} candidates
 * @param {number} [minPx]
 * @returns {T | null}
 */
export function pickMountain(point, candidates, minPx = 24) {
  const hits = candidates
    .map((c) => ({ item: c.item, distance: distanceToSegment(point, c.base, c.peak), limit: Math.max(minPx, c.radiusPx) }))
    .filter((c) => c.distance <= c.limit)
    .sort((a, b) => a.distance / a.limit - b.distance / b.limit);
  return hits[0]?.item ?? null;
}

/** まとめる距離の目安: 拡大率 16 で 40m。1 段引くごとに 2 倍(拡大率 12 で 640m、9 で約 5km)。 */
const MERGE_M_AT_ZOOM_16 = 40;
const ZOOM_FOR_BASE = 16;

/** 2 点の距離(m。狭い範囲なので平らとみなす)。 */
function distanceM(a, b) {
  const cos = Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  const dx = (a.lng - b.lng) * METERS_PER_DEGREE * cos;
  const dy = (a.lat - b.lat) * METERS_PER_DEGREE;
  return Math.hypot(dx, dy);
}

/** 同じ人のカロリーを足して、多い順に並べる。 */
function mergeMembers(members) {
  const byName = new Map();
  members.forEach((m) => byName.set(m.displayName, (byName.get(m.displayName) ?? 0) + m.calories));
  return [...byName].map(([displayName, calories]) => ({ displayName, calories })).sort((a, b) => b.calories - a.calories);
}

/**
 * 縮尺(拡大率)に合わせて、近くの雪山を 1 つの大きな雪山にまとめる。引いて見るほど広くまとまる。
 * まとめた雪山の位置はカロリーで重みを付けた真ん中、カロリーは同じ人どうし足す。
 * @param {Array<{ id: string, lat: number, lng: number, area: string, finishedAt: string, members: Array<{ displayName: string, calories: number }>, totalCalories: number }>} piles
 * @param {number} zoom 地図の拡大率
 * @returns {Array<{ id: string, lat: number, lng: number, area: string, finishedAt: string, members: Array<{ displayName: string, calories: number }>, totalCalories: number, count: number, pileIds: string[] }>}
 */
export function clusterPiles(piles, zoom) {
  const mergeM = MERGE_M_AT_ZOOM_16 * 2 ** (ZOOM_FOR_BASE - zoom);
  const sorted = [...piles].sort((a, b) => b.totalCalories - a.totalCalories);
  const groups = sorted.reduce((acc, pile) => {
    const index = acc.findIndex((g) => distanceM(g.center, pile) <= mergeM);
    if (index === -1) return [...acc, { center: { lat: pile.lat, lng: pile.lng }, piles: [pile] }];
    const group = acc[index];
    const nextPiles = [...group.piles, pile];
    const weight = (p) => Math.max(1, p.totalCalories);
    const totalWeight = nextPiles.reduce((sum, p) => sum + weight(p), 0);
    const center = {
      lat: nextPiles.reduce((sum, p) => sum + p.lat * weight(p), 0) / totalWeight,
      lng: nextPiles.reduce((sum, p) => sum + p.lng * weight(p), 0) / totalWeight,
    };
    return acc.map((g, i) => (i === index ? { center, piles: nextPiles } : g));
  }, []);
  return groups.map(({ center, piles: members }) => {
    const merged = mergeMembers(members.flatMap((p) => p.members));
    return {
      id: members.map((p) => p.id).join("+"),
      lat: center.lat,
      lng: center.lng,
      area: members[0].area,
      finishedAt: members.map((p) => p.finishedAt).sort().at(-1),
      members: merged,
      totalCalories: merged.reduce((sum, m) => sum + m.calories, 0),
      count: members.length,
      pileIds: members.map((p) => p.id),
    };
  });
}
