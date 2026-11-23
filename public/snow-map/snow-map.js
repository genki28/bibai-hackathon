// 美唄の雪山マップ(snow-map.html)の動き。
// - GET /api/snow-map の雪山を、3D の地図(MapLibre GL)の上に、Three.js の 3D の雪山として立てる(snow-mountain-3d.js)
// - 開いたときに、雪山が下から育つ。地図は少し傾けて、ぐるっと回すこともできる。画面には雪が降る
// - 雪山を押すと、下のシートに「一緒にやった人」の消費カロリーの棒グラフ
// - 縮尺に合わせて、近くの雪山は 1 つの大きな雪山にまとまる(引くほど広く。clusterPiles)。拡大すると分かれる
// - ?demo を付けると、見本の雪山(美唄の町なかとまわりの地区に 150 個。demo-data.js)を出す
// 注意: 画面に文字を入れるときは必ず textContent を使う(innerHTML は使わない)。名前は利用者が決めた文字。

import * as maplibreModule from "https://cdn.jsdelivr.net/npm/maplibre-gl@6.19.0/dist/maplibre-gl.mjs";
import { createDemoMap } from "./demo-data.js";
import { clusterPiles, viewScale } from "./snow-mountain.js";
import { createSnowMountainLayer } from "./snow-mountain-3d.js";

const maplibregl = maplibreModule.default ?? maplibreModule;

const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
const BIBAI = Object.freeze({ lng: 141.853, lat: 43.33 });
const HOME_VIEW = Object.freeze({ center: [BIBAI.lng, BIBAI.lat], zoom: 13.6, pitch: 58, bearing: -18 });
/** 雪山が育つ時間(ミリ秒)と、1 つずつずらして育てる間(ミリ秒)。 */
const GROW_MS = 2600;
const GROW_STAGGER_MS = 180;
/** 縮尺が変わってまとまり方が変わったときに、育ち直す時間(ミリ秒)。 */
const REGROW_MS = 700;
/** おにぎり 1 個のカロリー(kcal。たとえに使う目安)。 */
const ONIGIRI_KCAL = 180;
/** 棒グラフの色(白い背景でも見える色)。 */
const BAR_COLORS = Object.freeze(["#b73e2c", "#1a73e8", "#192e49", "#e8a200", "#4aa3c7", "#8e6cc7"]);
const SNOW_COUNT = 90;
const SPIN_DEG_PER_SEC = 6;

const byId = (id) => document.getElementById(id);
const format = (n) => Math.round(n).toLocaleString("ja-JP");
const prefersReducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

async function loadSnowMap() {
  if (new URLSearchParams(location.search).has("demo")) return createDemoMap();
  const response = await fetch("/api/snow-map");
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.success) throw new Error(body?.error ?? `読み込めませんでした(${response.status})`);
  return { ...body.data, isDemo: false };
}

/** 上の数のチップと見出し。 */
function renderTotals(data) {
  byId("stat-piles").textContent = format(data.totals.piles);
  byId("stat-people").textContent = format(data.totals.people);
  byId("stat-calories").textContent = format(data.totals.calories);
  const onigiri = Math.floor(data.totals.calories / ONIGIRI_KCAL);
  byId("stat-fun").textContent = onigiri > 0 ? `おにぎり ${format(onigiri)} 個ぶん` : "";
  byId("headline").textContent =
    data.totals.piles > 0 ? "いま、美唄は雪かきで盛り上がっています" : "最初の雪山を、いっしょに作ろう";
}

const timeAgo = (iso) => {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return `${minutes} 分前`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} 時間前`;
  return `${Math.round(minutes / 60 / 24)} 日前`;
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** 下のシートの一覧(新しい順)。 */
function renderList(piles, onSelect) {
  const items = [...piles]
    .sort((a, b) => b.finishedAt.localeCompare(a.finishedAt))
    .map((pile) => {
      const item = el("li", "pile-item");
      const main = el("div", "pile-main");
      main.append(
        el("p", "pile-name", `${pile.area}の雪山`),
        el("p", "pile-sub", `${pile.members.length} 人でいっしょに ・ ${timeAgo(pile.finishedAt)}`),
      );
      item.append(el("span", "pile-icon"), main, el("span", "pile-kcal", `${format(pile.totalCalories)} kcal`));
      item.addEventListener("click", () => onSelect(pile));
      return item;
    });
  byId("pile-list").replaceChildren(...(items.length > 0 ? items : [el("li", "pile-sub", "まだ雪山はありません")]));
}

/** 選んだ雪山の、一緒にやった人の棒グラフ(下から伸びる)。 */
function renderDetail(pile) {
  byId("sheet-list").hidden = true;
  byId("sheet-detail").hidden = false;
  const isMerged = (pile.count ?? 1) > 1;
  byId("detail-title").textContent = isMerged
    ? `${pile.area}あたりの雪山(${pile.count} か所)${format(pile.totalCalories)} kcal`
    : `${pile.area}の雪山 ${format(pile.totalCalories)} kcal`;
  byId("detail-sub").textContent = `${pile.members.length} 人でいっしょに雪かき ・ ${timeAgo(pile.finishedAt)}`;
  const max = Math.max(1, ...pile.members.map((m) => m.calories));
  const sorted = [...pile.members].sort((a, b) => b.calories - a.calories);
  const rows = sorted.map((member, i) => {
    const row = el("li", "bar-row");
    const track = el("span", "bar-track");
    const fill = el("span", "bar-fill");
    fill.style.setProperty("--bar-color", BAR_COLORS[i % BAR_COLORS.length]);
    track.append(fill);
    row.append(el("span", "bar-name", member.displayName), track, el("span", "bar-kcal", `${format(member.calories)}`));
    requestAnimationFrame(() => {
      fill.style.width = `${(member.calories / max) * 100}%`;
    });
    return row;
  });
  byId("detail-bars").replaceChildren(...rows);
}

function showList() {
  byId("sheet-list").hidden = false;
  byId("sheet-detail").hidden = true;
}

/** 雪山の上に、合計カロリーの札を立てる。 */
function addPeakLabels(map, piles, onSelect) {
  return piles.map((pile) => {
    const text = (pile.count ?? 1) > 1 ? `${pile.count} か所 ・ ${format(pile.totalCalories)} kcal` : `${format(pile.totalCalories)} kcal`;
    const label = el("button", "peak-label", text);
    label.type = "button";
    label.addEventListener("click", () => onSelect(pile));
    return new maplibregl.Marker({ element: label, anchor: "bottom", offset: [0, -6] }).setLngLat([pile.lng, pile.lat]).addTo(map);
  });
}

/** 縮尺に合わせて雪山をまとめ直す。まとまり方が変わったときだけ、札を作り直して育ち直す。 */
function createClusterView(map, mountains, piles, onSelect) {
  let shownKey = "";
  let markers = [];
  let clusters = [];
  const refresh = (isFirst) => {
    const next = clusterPiles(piles, map.getZoom());
    const key = next.map((c) => c.id).join("|");
    if (key === shownKey) return;
    shownKey = key;
    clusters = next;
    markers.forEach((m) => m.remove());
    markers = addPeakLabels(map, clusters, onSelect);
    const isReduced = prefersReducedMotion();
    mountains.setScale(viewScale(map.getZoom()));
    mountains.setPiles(clusters, {
      growMs: isReduced ? 0 : isFirst ? GROW_MS : REGROW_MS,
      staggerMs: isReduced || !isFirst ? 0 : GROW_STAGGER_MS,
    });
  };
  return { refresh };
}

/** 画面に雪を降らせる(Canvas)。 */
function startSnowfall() {
  if (prefersReducedMotion()) return;
  const canvas = byId("snowfall");
  const ctx = canvas.getContext("2d");
  const resize = () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  };
  resize();
  window.addEventListener("resize", resize);
  let flakes = Array.from({ length: SNOW_COUNT }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    r: 1 + Math.random() * 2.5,
    v: 0.4 + Math.random() * 1.1,
    drift: Math.random() * Math.PI * 2,
  }));
  const step = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    flakes = flakes.map((f) => {
      const y = f.y + f.v > canvas.height ? -4 : f.y + f.v;
      const x = (f.x + Math.sin((y + f.drift * 50) / 40) * 0.4 + canvas.width) % canvas.width;
      ctx.beginPath();
      ctx.arc(x, y, f.r, 0, Math.PI * 2);
      ctx.fill();
      return { ...f, x, y };
    });
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** 雪山がすべて見えるように、傾けたまま寄せる(なければ美唄の町なか)。 */
function fitToPiles(map, piles) {
  if (piles.length === 0) {
    map.jumpTo(HOME_VIEW);
    return;
  }
  const lngs = piles.map((p) => p.lng);
  const lats = piles.map((p) => p.lat);
  map.fitBounds(
    [
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)],
    ],
    { padding: { top: 160, bottom: 120, left: 60, right: 80 }, pitch: HOME_VIEW.pitch, bearing: HOME_VIEW.bearing, maxZoom: 16, duration: 0 },
  );
}

/** 右の丸いボタン(3D / 2D、ぐるっと回す、美唄全体)。 */
function setUpButtons(map) {
  let isSpinning = false;
  let lastSpinAt = 0;
  const spin = (now) => {
    if (!isSpinning) return;
    const dt = lastSpinAt ? (now - lastSpinAt) / 1000 : 0;
    lastSpinAt = now;
    map.setBearing(map.getBearing() + dt * SPIN_DEG_PER_SEC);
    requestAnimationFrame(spin);
  };
  byId("toggle-spin").addEventListener("click", () => {
    isSpinning = !isSpinning;
    lastSpinAt = 0;
    byId("toggle-spin").setAttribute("aria-pressed", String(isSpinning));
    if (isSpinning) requestAnimationFrame(spin);
  });
  byId("toggle-3d").addEventListener("click", () => {
    const is3d = map.getPitch() > 10;
    map.easeTo({ pitch: is3d ? 0 : HOME_VIEW.pitch, duration: 800 });
    byId("toggle-3d").setAttribute("aria-pressed", String(!is3d));
  });
  byId("reset-view").addEventListener("click", () => map.flyTo({ ...HOME_VIEW, duration: 1200 }));
}

async function main() {
  startSnowfall();
  const map = new maplibregl.Map({
    container: "map",
    style: STYLE_URL,
    ...HOME_VIEW,
    attributionControl: { compact: true },
  });
  setUpButtons(map);
  byId("detail-back").addEventListener("click", showList);
  const data = await loadSnowMap();
  renderTotals(data);
  const select = (pile) => {
    renderDetail(pile);
    map.flyTo({ center: [pile.lng, pile.lat], zoom: 15.5, pitch: 60, duration: 1200 });
  };
  renderList(data.piles, select);
  const onReady = () => {
    // 地図のスタイルが持っている初めの位置ではなく、美唄の雪山が見える位置にする
    fitToPiles(map, data.piles);
    const mountains = createSnowMountainLayer({
      id: "mountains",
      origin: BIBAI,
      mercatorFromLngLat: (lngLat) => maplibregl.MercatorCoordinate.fromLngLat(lngLat, 0),
    });
    map.addLayer(mountains.layer);
    const view = createClusterView(map, mountains, data.piles, select);
    // 雪山は 3D の絵なので、押した点との距離で選ぶ(てっぺんのあたりを押しても当たる)
    map.on("click", (event) => {
      const pile = mountains.pick(event.point);
      if (pile) select(pile);
    });
    map.on("mousemove", (event) => {
      map.getCanvas().style.cursor = mountains.pick(event.point) ? "pointer" : "";
    });
    view.refresh(true);
    map.on("zoom", () => mountains.setScale(viewScale(map.getZoom())));
    map.on("zoomend", () => view.refresh(false));
  };
  if (map.isStyleLoaded()) onReady();
  else map.once("load", onReady);
}

main().catch((error) => {
  console.error(error);
  byId("headline").textContent = `読み込めませんでした: ${error.message}`;
});
