// 【若者】範囲の記録の「筆で塗る」(地図の上に重ねた Canvas に、指で塗る)。計算は brush-area-core.js。
// - [筆で塗る] のときは地図を止めて、指でなぞったところを塗る。[地図を動かす] のときは地図を動かせる
// - 塗った線は緯度経度で覚えておき、地図を動かす・拡大するたびに描き直す(地図と一緒に動く)
// - 線は、同じ色で重ねても濃くならないように、別の Canvas に描いてから半透明で重ねる(墨のように)
// 3D のライブラリ(Three.js など)は使わない。ブラウザに入っている Canvas 2D だけで描く。

import { paintedAreaM2, toLocalMeters } from "./brush-area-core.js";

/** 塗りの色と濃さ。 */
const INK_COLOR = "#b73e2c";
const INK_ALPHA = 0.55;
/** 前の点からこれ以上動いたら、線に点を足す(画面の px)。 */
const MIN_STEP_PX = 3;

/**
 * 地図に筆を付ける。
 * @param {object} map Leaflet の地図
 * @param {HTMLElement} wrap 地図を包む箱(この中に Canvas を重ねる)
 * @param {{ lat: number, lng: number }} origin 面積を測る基準(家)
 * @param {(state: { areaM2: number, strokeCount: number }) => void} onChange 塗るたびに呼ぶ
 * @returns {{ setMode: (mode: "move" | "brush") => void, setWidth: (widthM: number) => void, undo: () => void, reset: () => void }}
 */
export function enableBrush(map, wrap, origin, onChange) {
  const canvas = document.createElement("canvas");
  canvas.className = "brush-canvas";
  wrap.append(canvas);
  const ink = document.createElement("canvas");
  /** 塗った線(緯度経度の点の列と、太さ m)。 */
  let strokes = [];
  let current = null;
  let widthM = 1.5;
  let isBrush = false;

  /** いまの拡大率で、1 m が何 px か。 */
  const pxPerMeter = () => {
    const size = map.getSize();
    const left = map.containerPointToLatLng([0, size.y / 2]);
    const right = map.containerPointToLatLng([size.x, size.y / 2]);
    return size.x / Math.max(0.01, map.distance(left, right));
  };

  function fitCanvas() {
    const size = map.getSize();
    const ratio = window.devicePixelRatio || 1;
    [canvas, ink].forEach((c) => {
      c.width = Math.round(size.x * ratio);
      c.height = Math.round(size.y * ratio);
    });
    canvas.style.width = `${size.x}px`;
    canvas.style.height = `${size.y}px`;
  }

  function render() {
    const ratio = window.devicePixelRatio || 1;
    const ctx = ink.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, ink.width, ink.height);
    ctx.strokeStyle = INK_COLOR;
    ctx.fillStyle = INK_COLOR;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const scale = pxPerMeter();
    [...strokes, ...(current ? [current] : [])].forEach((stroke) => {
      const pts = stroke.points.map((p) => map.latLngToContainerPoint([p.lat, p.lng]));
      const widthPx = stroke.widthM * scale;
      if (pts.length === 1) {
        ctx.beginPath();
        ctx.arc(pts[0].x, pts[0].y, widthPx / 2, 0, Math.PI * 2);
        ctx.fill();
        return;
      }
      ctx.lineWidth = widthPx;
      ctx.beginPath();
      pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
    });
    const view = canvas.getContext("2d");
    view.clearRect(0, 0, canvas.width, canvas.height);
    view.globalAlpha = INK_ALPHA;
    view.drawImage(ink, 0, 0);
    view.globalAlpha = 1;
  }

  function notify() {
    const local = strokes.map((s) => ({ widthM: s.widthM, points: s.points.map((p) => toLocalMeters(p, origin)) }));
    onChange({ areaM2: paintedAreaM2(local), strokeCount: strokes.length });
  }

  const pointOf = (event) => {
    const box = canvas.getBoundingClientRect();
    const latLng = map.containerPointToLatLng([event.clientX - box.left, event.clientY - box.top]);
    return { lat: latLng.lat, lng: latLng.lng, px: { x: event.clientX, y: event.clientY } };
  };

  canvas.addEventListener("pointerdown", (event) => {
    if (!isBrush) return;
    canvas.setPointerCapture(event.pointerId);
    const p = pointOf(event);
    current = { widthM, points: [{ lat: p.lat, lng: p.lng }], lastPx: p.px };
    render();
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!current) return;
    const p = pointOf(event);
    if (Math.hypot(p.px.x - current.lastPx.x, p.px.y - current.lastPx.y) < MIN_STEP_PX) return;
    current = { ...current, points: [...current.points, { lat: p.lat, lng: p.lng }], lastPx: p.px };
    render();
  });
  const endStroke = () => {
    if (!current) return;
    strokes = [...strokes, { widthM: current.widthM, points: current.points }];
    current = null;
    render();
    notify();
  };
  canvas.addEventListener("pointerup", endStroke);
  canvas.addEventListener("pointercancel", endStroke);

  map.on("move zoom", render);
  map.on("resize", () => {
    fitCanvas();
    render();
  });
  fitCanvas();
  render();

  return {
    setMode(mode) {
      isBrush = mode === "brush";
      canvas.classList.toggle("is-brush", isBrush);
      // 塗っている間は地図が動かないようにする
      [map.dragging, map.touchZoom, map.doubleClickZoom].forEach((handler) => (isBrush ? handler.disable() : handler.enable()));
    },
    setWidth(next) {
      widthM = next;
    },
    undo() {
      strokes = strokes.slice(0, -1);
      render();
      notify();
    },
    reset() {
      strokes = [];
      render();
      notify();
    },
  };
}
