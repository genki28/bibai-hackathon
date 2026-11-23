// 【お年寄り】待機画面の「来てくれる人の現在地」(タクシーアプリのように、向かっている人を地図に出す)。
// - 地図に、お年寄りの家(依頼に位置があれば)と、向かっている若者をドット絵のキャラクター(名前つき)で出す。
//   新しい位置が届くたびに、キャラクターが歩いて移動する(pixel-walker-marker.js)
// - 下に 1 人ずつ「〇〇さん あと約 5 分 / 1 分前の位置」「〇〇さんが着きました」「位置の共有なし」を出す
// - 位置はサーバーが依頼したお年寄り本人にだけ返す(30 分より古い位置・到着後は来ない)
// - 更新は help-waiting.js の数秒ごとの読み直しのたびに update(request) を呼ぶ。操作はいらない
// 注意: 画面に文字を入れるときは必ず textContent を使う(innerHTML は使わない)。

import { byId } from "./common.js";
import { helperProgress } from "./eta.js";
import { BIBAI_CENTER, createMap, DETAIL_ZOOM, fitToPoints, showPin } from "./map.js";
import { createWalkerMarker } from "./pixel-walker-marker.js";
import { el } from "./request-page.js";

/** 地図をいちばん寄せたときの拡大率(家と若者が近いとき)。 */
const MAX_FIT_ZOOM = DETAIL_ZOOM;
const OVERVIEW_ZOOM = 14;

/** 依頼に家の位置があればそれ、なければ null(家の印は出さない)。 */
const homeOf = (request) =>
  typeof request.lat === "number" && typeof request.lng === "number"
    ? { lat: request.lat, lng: request.lng }
    : null;

/** 地図を出すか: 向かっている人がいる間(参加あり、または雪かき中でまだ着いていない人がいる)。 */
export function shouldShowLiveMap(request) {
  if (!request || request.helpers.length === 0) return false;
  if (request.status === "accepted") return true;
  return request.status === "working" && request.helpers.some((h) => !h.arrivedAt);
}

/** 1 人ぶんの行の文。 */
function rowTexts(helper, progress) {
  const name = `${helper.displayName} さん`;
  if (progress.kind === "arrived") return { main: `${name}が着きました`, sub: "" };
  if (progress.kind === "no-location") return { main: name, sub: "位置の共有なし" };
  const eta = progress.minutes === null ? "向かっています" : `あと約 ${progress.minutes} 分`;
  return { main: `${name} ${eta}`, sub: progress.ageText };
}

function renderList(request, home, now) {
  const items = request.helpers.map((helper) => {
    const progress = helperProgress(helper, home, now);
    const { main, sub } = rowTexts(helper, progress);
    const item = el("li", undefined, `live-row is-${progress.kind}`);
    item.append(el("span", main, "live-main"));
    if (sub) item.append(el("span", sub, "live-sub"));
    return item;
  });
  byId("live-list").replaceChildren(...items);
}

/** 待機画面の現在地の表示を用意する。戻り値の update(request) を読み直しのたびに呼ぶ。 */
export function createElderLiveMap() {
  let map = null;
  let homePin = null;
  /** 向かっている人ごとのキャラクター(userId → 印)。 */
  let walkers = new Map();
  /** 地図の見える範囲を合わせたときの、人の並び(変わったときだけ合わせ直す。毎回動くと見づらいため)。 */
  let fittedKey = "";

  const ensureMap = (home) => {
    if (map) return map;
    map = createMap(byId("live-map"), home ?? BIBAI_CENTER, home ? DETAIL_ZOOM : OVERVIEW_ZOOM);
    if (map) map.scrollWheelZoom.disable();
    return map;
  };

  /** 向かっている人のキャラクターを、増やす・歩かせる・消す。 */
  const drawWalkers = (moving) => {
    const next = new Map();
    moving.forEach((helper) => {
      const walker = walkers.get(helper.userId) ?? createWalkerMarker(map, helper.location, `${helper.displayName} さん`);
      walker.moveTo(helper.location);
      next.set(helper.userId, walker);
    });
    walkers.forEach((walker, userId) => {
      if (!next.has(userId)) walker.remove();
    });
    walkers = next;
  };

  const drawMarkers = (request, home) => {
    if (home && !homePin) homePin = showPin(map, home, "おうち");
    const moving = request.helpers.filter((h) => !h.arrivedAt && h.location);
    drawWalkers(moving);
    const key = [home ? "home" : "", ...moving.map((h) => h.userId)].join("|");
    if (key === fittedKey) return;
    fittedKey = key;
    const points = [...(home ? [home] : []), ...moving.map((h) => h.location)];
    fitToPoints(map, points.length > 0 ? points : [BIBAI_CENTER], points.length > 0 ? MAX_FIT_ZOOM : OVERVIEW_ZOOM);
  };

  const update = (request) => {
    const section = byId("live-section");
    const isShown = shouldShowLiveMap(request);
    section.hidden = !isShown;
    if (!isShown) return;
    const home = homeOf(request);
    renderList(request, home, new Date());
    if (!ensureMap(home)) return;
    // 隠れていた箱が見えるようになったあと、地図の大きさを測り直す
    map.invalidateSize();
    drawMarkers(request, home);
  };

  return { update };
}
