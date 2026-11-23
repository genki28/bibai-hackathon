// 【お年寄り】待機画面の地図で、向かっている若者をドット絵のキャラクターで出す(elder-live-map.js から使う)。
// - キャラクターは雪かき中の画面と同じ主人公の画像(images/working-hero.png の 4 コマ)。2 コマを交互に出して歩いて見せる
// - 新しい位置が届いたら、前の位置からなめらかに歩いて移動する(MOVE_MS かけて)。進む向きに合わせて左右を向く
// - 「動きを減らす」設定の人には、歩く動きも移動のアニメーションもしない(すぐその場に出す)
// 注意: 名前は利用者が決めた文字なので、要素の textContent で入れる(HTML の文字列にしない)。

import { prefersReducedMotion } from "./effects.js";

/** 前の位置から新しい位置まで歩く時間(ミリ秒)。 */
const MOVE_MS = 2500;
/** 地図に出すキャラクターの大きさ(px)。画像の 1 コマ(271×247)と同じ比にする。 */
const ICON_WIDTH = 54;
const ICON_HEIGHT = 49;

/** 0〜1 の進み具合で、a から b のあいだの位置。 */
const lerp = (a, b, t) => a + (b - a) * t;
/** はじめと終わりをゆっくりにする。 */
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/**
 * ドット絵のキャラクターの印を地図に置く。
 * @param {object} map Leaflet の地図
 * @param {{ lat: number, lng: number }} point
 * @param {string} name 頭の上に出す名前
 * @returns {{ moveTo: (point: { lat: number, lng: number }) => void, remove: () => void }}
 */
export function createWalkerMarker(map, point, name) {
  const L = window.L;
  const isReduced = prefersReducedMotion();
  const sprite = document.createElement("span");
  sprite.className = isReduced ? "walker-sprite" : "walker-sprite is-walking";
  const label = document.createElement("span");
  label.textContent = name;
  const marker = L.marker([point.lat, point.lng], {
    icon: L.divIcon({
      className: "walker-marker",
      html: sprite,
      iconSize: [ICON_WIDTH, ICON_HEIGHT],
      iconAnchor: [ICON_WIDTH / 2, ICON_HEIGHT],
    }),
    keyboard: false,
  }).addTo(map);
  marker.bindTooltip(label, { permanent: true, direction: "top", offset: [0, -ICON_HEIGHT], className: "person-label" });

  let current = { ...point };
  let frameId = 0;

  function moveTo(next) {
    cancelAnimationFrame(frameId);
    // 西(左)へ進むときは左を向く
    if (next.lng !== current.lng) sprite.classList.toggle("is-left", next.lng < current.lng);
    if (isReduced) {
      current = { ...next };
      marker.setLatLng([next.lat, next.lng]);
      return;
    }
    const from = { ...current };
    const startedAt = performance.now();
    const step = (now) => {
      const t = easeInOut(Math.min(1, (now - startedAt) / MOVE_MS));
      current = { lat: lerp(from.lat, next.lat, t), lng: lerp(from.lng, next.lng, t) };
      marker.setLatLng([current.lat, current.lng]);
      if (t < 1) frameId = requestAnimationFrame(step);
    };
    frameId = requestAnimationFrame(step);
  }

  return {
    moveTo,
    remove() {
      cancelAnimationFrame(frameId);
      marker.remove();
    },
  };
}
