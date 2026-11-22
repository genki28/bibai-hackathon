// 地図の部品(Leaflet + OpenStreetMap)。地図を使う画面の .js から import して使う。
// HTML 側で Leaflet を読み込んでおくこと(<head> に leaflet.css、<body> の最後に leaflet.js)。
// 地図の出典(© OpenStreetMap contributors)は必ず表示する(OpenStreetMap の利用条件)。

import { polygonAreaM2 } from "./geo.js";

/** 位置がない依頼に使う、美唄市の中心あたり。 */
export const BIBAI_CENTER = { lat: 43.33, lng: 141.853 };
/** 大まかな地図で、場所をぼかして見せる円の半径(m)。 */
export const ROUGH_RADIUS_M = 600;
export const ROUGH_ZOOM = 14;
export const DETAIL_ZOOM = 17;
/** 雪かきの範囲を描くときの地図の拡大率(家のまわりが見えるくらい)。 */
export const DRAW_ZOOM = 19;

const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const MAX_ZOOM = 19;
const ACCENT = "#1c7ed6";

/** 依頼の位置(なければ美唄市の中心)。 */
export const pointOf = (request) =>
  typeof request?.lat === "number" && typeof request?.lng === "number"
    ? { lat: request.lat, lng: request.lng }
    : BIBAI_CENTER;

/**
 * 地図を作る。Leaflet が読み込めていなければ、箱にメッセージを出して null を返す。
 * @param {HTMLElement} element 地図を入れる箱(高さを CSS で決めておく)
 */
export function createMap(element, center, zoom) {
  const L = window.L;
  if (!L) {
    element.textContent = "地図を読み込めませんでした。通信の良いところで開き直してください。";
    return null;
  }
  const map = L.map(element).setView([center.lat, center.lng], zoom);
  L.tileLayer(TILE_URL, { maxZoom: MAX_ZOOM, attribution: ATTRIBUTION }).addTo(map);
  return map;
}

/** 正確な場所を見せず、円でおおまかに示す。 */
export function showRoughArea(map, center) {
  return window.L.circle([center.lat, center.lng], {
    radius: ROUGH_RADIUS_M,
    color: ACCENT,
    fillOpacity: 0.15,
  }).addTo(map);
}

/** 正確な場所にピンを立てる(参加した人だけに見せる)。 */
export function showPin(map, point, label) {
  const marker = window.L.marker([point.lat, point.lng]).addTo(map);
  if (label) marker.bindTooltip(label, { permanent: true, direction: "top", offset: [-15, -10] });
  return marker;
}

/**
 * 地図をタップして、雪かきした範囲(多角形)を描けるようにする。
 * 点が変わるたびに onChange({ points, areaM2 }) を呼ぶ。
 * 戻り値の undo() で 1 つ戻す、reset() でやり直す。
 */
export function enableAreaDrawing(map, onChange) {
  const L = window.L;
  map.doubleClickZoom.disable();
  const polygon = L.polygon([], { color: ACCENT, fillOpacity: 0.3 }).addTo(map);
  const dots = L.layerGroup().addTo(map);
  let points = [];

  const redraw = () => {
    polygon.setLatLngs(points.map((p) => [p.lat, p.lng]));
    dots.clearLayers();
    points.forEach((p) => L.circleMarker([p.lat, p.lng], { radius: 6, color: ACCENT }).addTo(dots));
    onChange({ points, areaM2: polygonAreaM2(points) });
  };

  map.on("click", (event) => {
    points = [...points, { lat: event.latlng.lat, lng: event.latlng.lng }];
    redraw();
  });

  return {
    undo: () => {
      points = points.slice(0, -1);
      redraw();
    },
    reset: () => {
      points = [];
      redraw();
    },
  };
}
