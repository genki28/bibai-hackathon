// 「美唄の雪山の地図」の、カロリー → 段々の雪山の形(純粋な関数。画面やブラウザの機能は使わない)。
// - 雪かき 1 件 = 雪山 1 つ。下から上へ STEPS 段の輪を重ね、上の段ほど小さく高くする(ドット絵のような段々の山)
// - 高さはみんなの消費カロリーの合計 × METERS_PER_KCAL(400 kcal を超えたら伸びをゆるめる)。段の色は、その高さの層を「つくった人」で分ける
//   (カロリーの多い人ほど、たくさんの段を受け持つ)。地図の 3D(MapLibre の fill-extrusion)で立てる
// 画面は snow-map.js。テストは tests/snow-mountain.test.ts。

/** 段の数。 */
export const STEPS = 8;
/** 1 kcal で何 m 高くするか(300 kcal ≒ 90m。町全体の地図でも見えるくらい)。 */
export const METERS_PER_KCAL = 0.3;
/** いちばん下の段の半径(m)と、カロリーが多いほど広がる量(√kcal に比例)。 */
const BASE_RADIUS_M = 70;
const RADIUS_PER_SQRT_KCAL = 2.2;
/** この kcal を超えたら、高さの伸びをゆるめる(まとめた大きな雪山が、塔ではなく山の形のままになるように)。 */
const STEEP_UNTIL_KCAL = 400;
const GENTLE_POWER = 0.7;
/** カロリーが 0 でも見えるようにする、最低の高さ(m)。 */
const MIN_HEIGHT_M = 6;
/** 輪の角の数(多いほど丸い)。 */
const RING_SIDES = 20;
const METERS_PER_DEGREE = 111_320;

/**
 * 真ん中から radiusM の輪(GeoJSON の [経度, 緯度] の列。最初と最後が同じ)。
 * @param {{ lat: number, lng: number }} center
 * @param {number} radiusM
 * @param {number} [sides]
 * @returns {Array<[number, number]>}
 */
export function ringAround(center, radiusM, sides = RING_SIDES) {
  const cos = Math.cos((center.lat * Math.PI) / 180);
  const points = Array.from({ length: sides }, (_, i) => {
    const angle = (i / sides) * Math.PI * 2;
    const dx = Math.cos(angle) * radiusM;
    const dy = Math.sin(angle) * radiusM;
    return [center.lng + dx / (METERS_PER_DEGREE * cos), center.lat + dy / METERS_PER_DEGREE];
  });
  return [...points, points[0]];
}

/** 高さの割合 t(0〜1)の層を受け持つ人(カロリーの多い人から下に積む)。 */
function memberAt(members, t) {
  const sorted = [...members].sort((a, b) => b.calories - a.calories);
  const total = sorted.reduce((sum, m) => sum + m.calories, 0);
  if (total <= 0) return sorted[0];
  let reached = 0;
  for (const member of sorted) {
    reached += member.calories / total;
    if (t < reached - 1e-9) return member;
  }
  return sorted[sorted.length - 1];
}

/**
 * 1 つの雪山の形(段ごとの GeoJSON Feature)。
 * @param {{ id: string, lat: number, lng: number, members: Array<{ displayName: string, calories: number }> }} pile
 * @param {number} progress 育つ途中の割合(0〜1。開いたときに下から育てる)
 * @param {number} [scale] 見た目の大きさの倍率(引いて見たときに大きくして、見えるようにする)
 * @returns {Array<{ type: "Feature", geometry: object, properties: { id: string, step: number, base: number, height: number, member: string, memberIndex: number } }>}
 */
export function mountainFeatures(pile, progress, scale = 1) {
  const total = pile.members.reduce((sum, m) => sum + Math.max(0, m.calories), 0);
  const effective = total <= STEEP_UNTIL_KCAL ? total : STEEP_UNTIL_KCAL + (total - STEEP_UNTIL_KCAL) ** GENTLE_POWER;
  const fullHeight = Math.max(MIN_HEIGHT_M, effective * METERS_PER_KCAL);
  const height = fullHeight * Math.max(0, Math.min(1, progress)) * scale;
  const bottomRadius = (BASE_RADIUS_M + Math.sqrt(total) * RADIUS_PER_SQRT_KCAL) * scale;
  const order = [...pile.members].sort((a, b) => b.calories - a.calories).map((m) => m.displayName);
  return Array.from({ length: STEPS }, (_, step) => {
    const owner = memberAt(pile.members, (step + 0.5) / STEPS);
    // 上の段ほど小さく(いちばん上は下の 15% の半径。すそ野の広い雪山にする)
    const radius = bottomRadius * (1 - (step / STEPS) * 0.85);
    return {
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [ringAround(pile, radius)] },
      properties: {
        id: pile.id,
        step,
        base: (height * step) / STEPS,
        height: (height * (step + 1)) / STEPS,
        member: owner?.displayName ?? "",
        memberIndex: Math.max(0, order.indexOf(owner?.displayName ?? "")),
      },
    };
  });
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
