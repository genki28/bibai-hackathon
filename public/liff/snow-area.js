// 【若者】雪かきをした範囲を描く画面の動き。面積を計算して、終了の API に送る。
// 地図の上の操作(点を動かす・消す・足す、モード)は map.js の enableAreaDrawing。
// 注意: 画面に文字を入れるときは必ず textContent を使う(innerHTML は使わない)。

import { byId } from "./common.js";
import { navigateTo, pageReady } from "./loading.js";
import { AREA_MODE, createMap, DRAW_ZOOM, enableAreaDrawing, pointOf } from "./map.js";
import {
  fetchRequest,
  pageUrl,
  postAction,
  requestIdFromUrl,
  showError,
  showMessageOnly,
  stopIfUnavailable,
} from "./request-page.js";
import { userIdPromise } from "./template.js";

/** サーバーが受け付ける面積の上限(㎡)。src/help-requests/model.ts の MAX_AREA_M2 と同じ値。 */
const MAX_AREA_M2 = 300;
const MIN_POINTS = 3;
/** [四角で始める] で置く四角形の 1 辺(m)。角をつまんで広げてもらう前提で小さめ。 */
const START_SQUARE_SIZE_M = 15;

/** モードごとの、地図の上のしるしと説明文。 */
const MODE_TEXT = {
  [AREA_MODE.move]: {
    badge: "✋ 地図を動かす",
    hint: "点をつまんで動かせます。点をタップすると消えます。",
  },
  [AREA_MODE.draw]: {
    badge: "✏️ 描いています",
    hint: "地図をタップすると点が増えます。辺の真ん中の丸を引っぱっても増えます。",
  },
};
const EMPTY_HINT = "[四角で始める] を押すか、[範囲を描く] にして地図をタップしてください。";

let areaM2 = 0;
let pointCount = 0;
let currentMode = AREA_MODE.move;

function showModeAndHint() {
  const text = MODE_TEXT[currentMode];
  const isDrawing = currentMode === AREA_MODE.draw;
  byId("mode-move").setAttribute("aria-pressed", String(!isDrawing));
  byId("mode-draw").setAttribute("aria-pressed", String(isDrawing));
  byId("map-wrap").classList.toggle("is-drawing", isDrawing);
  byId("mode-badge").textContent = text.badge;
  byId("area-hint").textContent = pointCount === 0 && !isDrawing ? EMPTY_HINT : text.hint;
}

function onShapeChange({ points, areaM2: area, canUndo }) {
  areaM2 = Math.round(area);
  pointCount = points.length;
  byId("area-size").textContent = `${areaM2.toLocaleString("ja-JP")} ㎡`;
  const isTooLarge = areaM2 > MAX_AREA_M2;
  byId("finish-button").disabled = points.length < MIN_POINTS || isTooLarge;
  byId("undo-button").disabled = !canUndo;
  byId("reset-button").disabled = points.length === 0;
  // 点が 0 のときだけ [四角で始める] を目立つボタンにする
  byId("square-button").classList.toggle("secondary", points.length > 0);
  showError(isTooLarge ? `広すぎます(${MAX_AREA_M2.toLocaleString("ja-JP")} ㎡まで)。点を動かして狭くしてください。` : "");
  showModeAndHint();
}

function setUpAreaControls(drawing) {
  const changeMode = (mode) => {
    currentMode = mode;
    drawing.setMode(mode);
    showModeAndHint();
  };
  byId("mode-move").addEventListener("click", () => changeMode(AREA_MODE.move));
  byId("mode-draw").addEventListener("click", () => changeMode(AREA_MODE.draw));
  byId("square-button").addEventListener("click", () => drawing.startSquare(START_SQUARE_SIZE_M));
  byId("undo-button").addEventListener("click", drawing.undo);
  byId("reset-button").addEventListener("click", drawing.reset);
  changeMode(AREA_MODE.move);
}

/** 地図が出せないときは、地図の操作のボタンを押せないようにする。 */
function disableAreaControls() {
  ["mode-move", "mode-draw", "square-button", "undo-button", "reset-button"].forEach((id) => {
    byId(id).disabled = true;
  });
}

async function onFinish(id, userId) {
  const button = byId("finish-button");
  button.disabled = true;
  try {
    await postAction(id, "finish", { userId, areaM2 });
    navigateTo(pageUrl("finish.html", id), { replace: true });
  } catch (error) {
    console.error(error);
    showError(`終了できませんでした: ${error.message}`);
    button.disabled = false;
  }
}

async function main() {
  const id = requestIdFromUrl();
  if (!id) {
    showMessageOnly("依頼が分かりません", "「助けに行く」から、行きたい依頼を選んでください。");
    return;
  }
  const userId = await userIdPromise;
  const request = await fetchRequest(id, userId);
  if (stopIfUnavailable(request)) return;
  if (request.status === "done") {
    navigateTo(pageUrl("finish.html", id), { replace: true });
    return;
  }
  // 範囲に丸を付けるのはリーダーだけ。リーダー以外は「リーダーを待つ」表示へ
  if (request.leaderUserId && request.leaderUserId !== userId) {
    navigateTo(`${pageUrl("helper-working.html", id)}&wait=1`, { replace: true });
    return;
  }
  byId("area-limit").textContent = `${MAX_AREA_M2.toLocaleString("ja-JP")} ㎡ まで(家のまわり・道くらい)`;
  byId("finish-button").addEventListener("click", () => onFinish(id, userId));
  const map = createMap(byId("area-map"), pointOf(request), DRAW_ZOOM);
  if (!map) {
    // 地図が出せないときも終われるように、面積 0 ㎡ で終了できるようにする
    byId("finish-button").disabled = false;
    disableAreaControls();
    return;
  }
  setUpAreaControls(enableAreaDrawing(map, onShapeChange));
}

main()
  .catch((error) => {
    console.error(error);
    showError(`読み込めませんでした: ${error.message}`);
  })
  .finally(pageReady);
