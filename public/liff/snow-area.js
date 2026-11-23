// 【若者】雪かきをした範囲を、地図の上に筆で塗る画面の動き。塗った面積を計算して、終了の API に送る。
// 塗る操作は brush-area.js、面積の計算は brush-area-core.js。
// 注意: 画面に文字を入れるときは必ず textContent を使う(innerHTML は使わない)。

import { byId, setIconText } from "./common.js";
import { enableBrush } from "./brush-area.js";
import { navigateTo, pageReady } from "./loading.js";
import { createMap, DRAW_ZOOM, pointOf } from "./map.js";
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
const MAX_AREA_M2 = 5000;
/** 筆の太さ(m)。 */
const BRUSH_WIDTH_M = Object.freeze({ thin: 1.5, thick: 4 });
const MODE = Object.freeze({ move: "move", brush: "brush" });

/** モードごとの、地図の上のしるしと説明文。 */
const MODE_TEXT = {
  [MODE.move]: { badge: "地図を動かす", badgeIcon: "hand", hint: "雪かきした場所まで地図を動かしてね" },
  [MODE.brush]: { badge: "筆で塗っています", badgeIcon: "pencil", hint: "雪かきしたところを指でなぞって塗ってね" },
};

let areaM2 = 0;
let strokeCount = 0;
let currentMode = MODE.move;

function showModeAndHint() {
  const text = MODE_TEXT[currentMode];
  const isBrush = currentMode === MODE.brush;
  byId("mode-move").setAttribute("aria-pressed", String(!isBrush));
  byId("mode-draw").setAttribute("aria-pressed", String(isBrush));
  byId("map-wrap").classList.toggle("is-drawing", isBrush);
  setIconText(byId("mode-badge"), text.badgeIcon, text.badge);
  byId("area-hint").textContent = text.hint;
}

function onPaint({ areaM2: area, strokeCount: count }) {
  areaM2 = Math.round(area);
  strokeCount = count;
  byId("area-size").textContent = `${areaM2.toLocaleString("ja-JP")} ㎡`;
  const isTooLarge = areaM2 > MAX_AREA_M2;
  byId("finish-button").disabled = strokeCount === 0 || isTooLarge;
  byId("undo-button").disabled = strokeCount === 0;
  byId("reset-button").disabled = strokeCount === 0;
  showError(isTooLarge ? `広すぎます(${MAX_AREA_M2.toLocaleString("ja-JP")} ㎡まで)。[1 つ戻す] で減らしてください。` : "");
}

function setUpBrushControls(brush) {
  const changeMode = (mode) => {
    currentMode = mode;
    brush.setMode(mode);
    showModeAndHint();
  };
  const changeWidth = (key) => {
    brush.setWidth(BRUSH_WIDTH_M[key]);
    byId("brush-thin").setAttribute("aria-pressed", String(key === "thin"));
    byId("brush-thick").setAttribute("aria-pressed", String(key === "thick"));
    // 太さを選んだら、そのまま塗れるようにする
    changeMode(MODE.brush);
  };
  byId("mode-move").addEventListener("click", () => changeMode(MODE.move));
  byId("mode-draw").addEventListener("click", () => changeMode(MODE.brush));
  byId("brush-thin").addEventListener("click", () => changeWidth("thin"));
  byId("brush-thick").addEventListener("click", () => changeWidth("thick"));
  byId("undo-button").addEventListener("click", brush.undo);
  byId("reset-button").addEventListener("click", brush.reset);
  changeMode(MODE.brush);
  onPaint({ areaM2: 0, strokeCount: 0 });
}

/** 地図が出せないときは、地図の操作のボタンを押せないようにする。 */
function disableAreaControls() {
  ["mode-move", "mode-draw", "brush-thin", "brush-thick", "undo-button", "reset-button"].forEach((id) => {
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
  byId("area-limit").textContent = `${MAX_AREA_M2.toLocaleString("ja-JP")} ㎡ まで`;
  byId("finish-button").addEventListener("click", () => onFinish(id, userId));
  const map = createMap(byId("area-map"), pointOf(request), DRAW_ZOOM);
  if (!map) {
    // 地図が出せないときも終われるように、面積 0 ㎡ で終了できるようにする
    byId("finish-button").disabled = false;
    disableAreaControls();
    return;
  }
  setUpBrushControls(enableBrush(map, byId("map-wrap"), pointOf(request), onPaint));
}

main()
  .catch((error) => {
    console.error(error);
    showError(`読み込めませんでした: ${error.message}`);
  })
  .finally(pageReady);
