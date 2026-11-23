// 美唄の雪山マップの「見本のデータ」(?demo のとき。純粋な関数。画面やブラウザの機能は使わない)。
// - 美唄の町なかと、まわりの地区(茶志内・光珠内・我路・東明 など)に、たくさんの雪山をちらばらせる
// - 種(seed)が同じなら、いつも同じ雪山になる(説明やスクリーンショットがぶれないように)
// - 名前は架空のニックネームだけ(実在の人の名前は使わない)
// テストは tests/snow-map-demo.test.ts。

/** 雪山を集める場所: [緯度, 経度, 散らばり(度), 重み(多いほど雪山が多い)]。町なかが多め。 */
const AREAS = Object.freeze([
  { name: "中央", lat: 43.3332, lng: 141.8536, spread: 0.008, weight: 6 },
  { name: "東", lat: 43.3348, lng: 141.8668, spread: 0.006, weight: 3 },
  { name: "西", lat: 43.3301, lng: 141.8402, spread: 0.006, weight: 3 },
  { name: "南", lat: 43.3218, lng: 141.8551, spread: 0.006, weight: 2 },
  { name: "北", lat: 43.3431, lng: 141.8557, spread: 0.006, weight: 2 },
  { name: "茶志内", lat: 43.3032, lng: 141.8318, spread: 0.006, weight: 2 },
  { name: "光珠内", lat: 43.3628, lng: 141.8602, spread: 0.006, weight: 2 },
  { name: "我路", lat: 43.3196, lng: 141.8987, spread: 0.005, weight: 1 },
  { name: "東明", lat: 43.3522, lng: 141.8841, spread: 0.005, weight: 1 },
]);

/** 架空のニックネーム。 */
const NICKNAMES = Object.freeze([
  "ゆきお", "あかり", "はると", "そら", "みなと", "こはる", "りく", "ひなた", "つむぎ", "れん",
  "さくら", "かいと", "ゆい", "そうた", "めい", "だいち", "ほのか", "たける", "ゆず", "あおい",
  "雪だるま部長", "北斗", "美唄の星", "スコップ王", "ママさんダンプ", "白い戦士", "まがん", "ハスカップ",
  "焼き鳥大好き", "炭鉱っ子", "アルテ", "宮島沼", "雪かき初心者", "朝練", "ぽかぽか", "しんしん",
  "まっしろ", "ざくざく", "どさんこ", "ふわゆき",
]);

/** 1 人ぶんの消費カロリーの幅(kcal)と、チームの人数の幅。 */
const MIN_KCAL = 60;
const MAX_KCAL = 420;
const MIN_TEAM = 2;
const MAX_TEAM = 6;
/** 雪かきをした日の幅(何日前まで)。 */
const DAYS_BACK = 14;
const DAY_MS = 86_400_000;

/** 種から、0 以上 1 未満の数を順に出す(同じ種なら同じ列)。 */
function createRandom(seed) {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

/** 重みに合わせて地区を選ぶ。 */
function pickArea(random) {
  const total = AREAS.reduce((sum, a) => sum + a.weight, 0);
  let point = random() * total;
  return AREAS.find((a) => (point -= a.weight) < 0) ?? AREAS[0];
}

/** ニックネームを重ならないように count 人選ぶ。 */
function pickNames(random, count) {
  const names = new Set();
  while (names.size < count) names.add(NICKNAMES[Math.floor(random() * NICKNAMES.length)]);
  return [...names];
}

/**
 * 見本の雪山の地図(GET /api/snow-map と同じ形 + isDemo)。
 * @param {{ count?: number, seed?: number, now?: number }} [options] count = 雪山の数、now = いまの時刻(ミリ秒)
 * @returns {{ piles: Array<object>, totals: { piles: number, people: number, calories: number }, isDemo: true }}
 */
export function createDemoMap({ count = 150, seed = 20261123, now = Date.now() } = {}) {
  const random = createRandom(seed);
  const piles = Array.from({ length: count }, (_, i) => {
    const area = pickArea(random);
    const size = MIN_TEAM + Math.floor(random() * (MAX_TEAM - MIN_TEAM + 1));
    const members = pickNames(random, size)
      .map((displayName) => ({ displayName, calories: Math.round(MIN_KCAL + random() * (MAX_KCAL - MIN_KCAL)) }))
      .sort((a, b) => b.calories - a.calories);
    // 新しい雪山ほど多く(最近盛り上がっているように)
    const ageMs = random() ** 2 * DAYS_BACK * DAY_MS;
    return {
      id: `demo-${i}`,
      lat: Math.round((area.lat + (random() - 0.5) * 2 * area.spread) * 1000) / 1000,
      lng: Math.round((area.lng + (random() - 0.5) * 2 * area.spread) * 1000) / 1000,
      area: area.name,
      finishedAt: new Date(now - ageMs).toISOString(),
      members,
      totalCalories: members.reduce((sum, m) => sum + m.calories, 0),
    };
  });
  const people = new Set(piles.flatMap((p) => p.members.map((m) => m.displayName))).size;
  const calories = piles.reduce((sum, p) => sum + p.totalCalories, 0);
  return { piles, totals: { piles: piles.length, people, calories }, isDemo: true };
}
