// 地図の部品(Leaflet + OpenStreetMap)。地図を使う画面の .js から import して使う。
// HTML 側で Leaflet を読み込んでおくこと(<head> に leaflet.css、<body> の最後に leaflet.js)。
// 地図の出典(© OpenStreetMap contributors)は必ず表示する(OpenStreetMap の利用条件)。

import {
  edgeMidpoints,
  insertPointAt,
  movePointAt,
  polygonAreaM2,
  removePointAt,
  squareAround,
} from "./geo.js";

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
 * 人の印(丸いアイコン + 名前の札)を置く。名前は利用者が決めた文字なので、
 * HTML の文字列ではなく要素(textContent)で渡す。
 */
export function showPersonMarker(map, point, name, iconName = "runner") {
  const L = window.L;
  const icon = document.createElement("span");
  icon.className = "person-marker-icon";
  const img = document.createElement("img");
  img.src = new URL(`./icons/${iconName}.svg`, import.meta.url).href;
  img.alt = "";
  img.className = "ui-icon";
  icon.append(img);
  const label = document.createElement("span");
  label.textContent = name;
  const marker = L.marker([point.lat, point.lng], {
    icon: L.divIcon({ className: "person-marker", html: icon, iconSize: [44, 44], iconAnchor: [22, 22] }),
    keyboard: false,
  }).addTo(map);
  marker.bindTooltip(label, { permanent: true, direction: "top", offset: [0, -22], className: "person-label" });
  return marker;
}

/** points がすべて見えるように地図を動かす(1 点だけならそこを真ん中に)。 */
export function fitToPoints(map, points, maxZoom = DETAIL_ZOOM) {
  if (points.length === 0) return;
  if (points.length === 1) {
    map.setView([points[0].lat, points[0].lng], maxZoom);
    return;
  }
  map.fitBounds(points.map((p) => [p.lat, p.lng]), { padding: [48, 48], maxZoom });
}

/** 範囲を描くときの 2 つのモード。move = 地図を動かす、draw = タップで点を足す。 */
export const AREA_MODE = Object.freeze({ move: "move", draw: "draw" });
/** 角の点(つかんで動かす・タップで消す)の大きさ(px)。指で押しやすいように 24px 以上。 */
const VERTEX_SIZE_PX = 30;
/** 辺の真ん中のつまみ(引っぱると点が増える)の大きさ(px)。見た目は小さく、押せる範囲は 24px 以上。 */
const MIDPOINT_SIZE_PX = 26;
/** 点を動かしている間、地図の箱に付ける印(辺のつまみを隠すため)。 */
const DRAGGING_CLASS = "is-dragging-point";
/** 描くモードのとき、地図の箱に付ける印(枠の色を変える)。 */
const DRAWING_CLASS = "is-drawing";

const toPoint = (latLng) => ({ lat: latLng.lat, lng: latLng.lng });
const toLatLngs = (points) => points.map((p) => [p.lat, p.lng]);
const handleIcon = (className, size) =>
  window.L.divIcon({ className: `area-handle ${className}`, iconSize: [size, size] });

/**
 * 雪かきした範囲(多角形)を描けるようにする。
 * - 角の点はつかんで動かせる。タップすると消える
 * - 辺の真ん中のつまみを引っぱる(またはタップする)と、そこに点が増える
 * - 描くモード(setMode("draw"))のときだけ、地図をタップすると点が増える
 * 形が変わるたび(動かしている途中も)onChange({ points, areaM2, canUndo }) を呼ぶ。
 * 戻り値: undo() 1 つ戻す / reset() やり直す / startSquare(sizeM) 四角で始める / setMode(mode)
 */
export function enableAreaDrawing(map, onChange) {
  const L = window.L;
  map.doubleClickZoom.disable();
  const container = map.getContainer();
  // interactive: false にして、形の上をタップしても地図のタップとして扱う
  const polygon = L.polygon([], { color: ACCENT, fillOpacity: 0.3, interactive: false }).addTo(map);
  const handles = L.layerGroup().addTo(map);
  let points = [];
  /** 1 つ戻す用に、変える前の点の一覧を順にためておく。 */
  let history = [];
  let mode = AREA_MODE.move;

  // 線と面積だけ描き直す(点を動かしている途中に使う。つまみは作り直さない)
  const preview = (shown) => {
    polygon.setLatLngs(toLatLngs(shown));
    onChange({ points: shown, areaM2: polygonAreaM2(shown), canUndo: history.length > 0 });
  };

  const redraw = () => {
    handles.clearLayers();
    preview(points);
    points.forEach((point, index) => addVertex(point, index));
    edgeMidpoints(points).forEach(({ insertAt, point }) => addMidpoint(point, insertAt));
  };

  // 形を変えて確定する(変える前を履歴に残す)
  const commit = (next) => {
    history = [...history, points];
    points = next;
    redraw();
  };

  // つまみ(角の点・辺のつまみ)を引っぱったときの共通の動き。
  // shapeAt(latLng) は「つまみがその位置にあるときの形」を返す
  const makeDraggable = (marker, shapeAt) => {
    marker.on("dragstart", () => container.classList.add(DRAGGING_CLASS));
    marker.on("drag", () => preview(shapeAt(toPoint(marker.getLatLng()))));
    marker.on("dragend", () => {
      container.classList.remove(DRAGGING_CLASS);
      const next = shapeAt(toPoint(marker.getLatLng()));
      // 引っぱり終わりの処理(Leaflet 側)が済んでから、つまみを作り直す
      setTimeout(() => commit(next), 0);
    });
  };

  const addVertex = (point, index) => {
    const marker = L.marker([point.lat, point.lng], {
      draggable: true,
      icon: handleIcon("area-vertex", VERTEX_SIZE_PX),
    }).addTo(handles);
    makeDraggable(marker, (moved) => movePointAt(points, index, moved));
    marker.on("click", () => commit(removePointAt(points, index)));
  };

  const addMidpoint = (point, insertAt) => {
    const marker = L.marker([point.lat, point.lng], {
      draggable: true,
      icon: handleIcon("area-midpoint", MIDPOINT_SIZE_PX),
    }).addTo(handles);
    makeDraggable(marker, (added) => insertPointAt(points, insertAt, added));
    marker.on("click", () => commit(insertPointAt(points, insertAt, point)));
  };

  map.on("click", (event) => {
    if (mode !== AREA_MODE.draw) return;
    commit([...points, toPoint(event.latlng)]);
  });

  const setMode = (next) => {
    mode = next === AREA_MODE.draw ? AREA_MODE.draw : AREA_MODE.move;
    const isDrawing = mode === AREA_MODE.draw;
    // 描くモードでは地図を止めて、タップが「点を置く」だけになるようにする(2 本指の拡大は使える)
    if (isDrawing) map.dragging.disable();
    else map.dragging.enable();
    container.classList.toggle(DRAWING_CLASS, isDrawing);
  };

  redraw();
  return {
    undo: () => {
      if (history.length === 0) return;
      points = history[history.length - 1];
      history = history.slice(0, -1);
      redraw();
    },
    reset: () => {
      if (points.length === 0) return;
      commit([]);
    },
    startSquare: (sizeM) => commit(squareAround(toPoint(map.getCenter()), sizeM)),
    setMode,
  };
}
