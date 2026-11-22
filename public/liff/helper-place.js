// 【若者】参加した依頼の場所・詳細の動き。正確な住所と地図は、参加した人にだけ見せる。
// 注意: 画面に文字を入れるときは必ず textContent を使う(innerHTML は使わない)。

import { byId } from "./common.js";
import { createMap, DETAIL_ZOOM, pointOf, showPin } from "./map.js";
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

const AMOUNT_LABELS = { little: "すこし", normal: "ふつう", lots: "たくさん" };

function render(request) {
  byId("address").textContent = request.address ?? "(住所の登録なし。美唄市内)";
  byId("elder-name").textContent = request.name ? `${request.name} さん` : "(名前の登録なし)";
  byId("amount").textContent = AMOUNT_LABELS[request.amount] ?? "-";
  byId("helper-count").textContent = `${request.helpers.length}/${request.capacity}人`;
  byId("tools").textContent = request.tools ? `道具: ${request.tools}` : "";
  const point = pointOf(request);
  const map = createMap(byId("detail-map"), point, DETAIL_ZOOM);
  if (map) showPin(map, point, "ここ");
}

/** ボタンを押している間は二重に押せないようにして、action を実行する。 */
async function runWithButton(buttonId, action) {
  const button = byId(buttonId);
  button.disabled = true;
  showError("");
  try {
    await action();
  } catch (error) {
    console.error(error);
    showError(error.message);
  } finally {
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
  if (request.status === "working") {
    location.replace(pageUrl("helper-working.html", id));
    return;
  }
  render(request);

  byId("leave-button").addEventListener("click", () =>
    runWithButton("leave-button", async () => {
      if (!confirm("この依頼への参加を取り消しますか?")) return;
      await postAction(id, "leave", { userId });
      location.href = "./go-help.html";
    }),
  );
  byId("arrive-button").addEventListener("click", () =>
    runWithButton("arrive-button", async () => {
      await postAction(id, "arrive", { userId });
      location.href = pageUrl("helper-gather.html", id);
    }),
  );
}

main().catch((error) => {
  console.error(error);
  showError(`読み込めませんでした: ${error.message}`);
});
