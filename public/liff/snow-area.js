// 【若者】雪かきをした範囲を描く画面の動き。面積を計算して、終了の API に送る。
// 注意: 画面に文字を入れるときは必ず textContent を使う(innerHTML は使わない)。

import { byId } from "./common.js";
import { createMap, DRAW_ZOOM, enableAreaDrawing, pointOf } from "./map.js";
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
const MAX_AREA_M2 = 2000;
const MIN_POINTS = 3;

let areaM2 = 0;

function onShapeChange({ points, areaM2: area }) {
  areaM2 = Math.round(area);
  byId("area-size").textContent = `${areaM2.toLocaleString("ja-JP")} ㎡`;
  const isTooLarge = areaM2 > MAX_AREA_M2;
  byId("finish-button").disabled = points.length < MIN_POINTS || isTooLarge;
  showError(isTooLarge ? `広すぎます(${MAX_AREA_M2.toLocaleString("ja-JP")} ㎡まで)。やり直してください。` : "");
}

async function onFinish(id, userId) {
  const button = byId("finish-button");
  button.disabled = true;
  try {
    await postAction(id, "finish", { userId, areaM2 });
    location.replace(pageUrl("finish.html", id));
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
    location.replace(pageUrl("finish.html", id));
    return;
  }
  byId("finish-button").addEventListener("click", () => onFinish(id, userId));
  const map = createMap(byId("area-map"), pointOf(request), DRAW_ZOOM);
  if (!map) {
    // 地図が出せないときも終われるように、面積 0 ㎡ で終了できるようにする
    byId("finish-button").disabled = false;
    return;
  }
  const drawing = enableAreaDrawing(map, onShapeChange);
  byId("undo-button").addEventListener("click", drawing.undo);
  byId("reset-button").addEventListener("click", drawing.reset);
}

main().catch((error) => {
  console.error(error);
  showError(`読み込めませんでした: ${error.message}`);
});
