// 【若者】参加した依頼の場所・詳細の動き。正確な住所と地図は、参加した人にだけ見せる。
// スリープなどから戻った瞬間に読み直し、雪かきが始まっていれば雪かき中の画面へ進む。
// 開いている間は、共有を選んだ人の現在地をお年寄りに送る(location-share.js)。到着・取り消しで止める。
// 音の合言葉(helper-sound-code.js)をお年寄りのスマホが聞き取ったら、[到着しました] を押さなくても到着になる。
// 注意: 画面に文字を入れるときは必ず textContent を使う(innerHTML は使わない)。

import { byId, fetchAppConfig } from "./common.js";
import { startSoundCode } from "./helper-sound-code.js";
import { startLocationShare } from "./location-share.js";
import { navigateTo, pageReady } from "./loading.js";
import { createMap, DETAIL_ZOOM, pointOf, showPin } from "./map.js";
import {
  fetchRequest,
  onPageVisible,
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

/** テスト用の設定(testMode)がオンか。読めなければオフ。 */
async function isTestMode() {
  try {
    return (await fetchAppConfig()).testMode;
  } catch {
    return false;
  }
}

/** 現在地の共有を始める(うまく始められなくても、参加はそのまま続ける)。 */
async function startSharing(id, userId, request) {
  // もう到着している人は送らない(サーバーも受け付けない)
  const me = request.helpers.find((h) => h.userId === userId);
  if (me?.arrivedAt) {
    byId("share-card").hidden = true;
    return { stop: () => {} };
  }
  try {
    return startLocationShare({
      home: pointOf(request),
      send: (point) => postAction(id, "location", { userId, ...point }),
      isTestMode: await isTestMode(),
    });
  } catch (error) {
    console.error("位置の共有を始められませんでした", error);
    return { stop: () => {} };
  }
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
    navigateTo(pageUrl("helper-working.html", id), { replace: true });
    return;
  }
  render(request);
  const sharing = await startSharing(id, userId, request);
  byId("sound-card").hidden = Boolean(request.helpers.find((h) => h.userId === userId)?.arrivedAt);
  const soundCode = startSoundCode({
    requestId: id,
    userId,
    onArrived: () => {
      sharing.stop();
      navigateTo(pageUrl("helper-gather.html", id));
    },
  });
  // スリープなどから戻ったとき、ほかの人が雪かきを始めていたら雪かき中の画面へ(取り消されていればその表示)
  const stopWatching = onPageVisible(async () => {
    try {
      const latest = await fetchRequest(id, userId);
      if (stopIfUnavailable(latest)) {
        stopWatching();
        sharing.stop();
        return;
      }
      if (latest.status === "working" || latest.status === "done") {
        stopWatching();
        sharing.stop();
        navigateTo(pageUrl("helper-working.html", id), { replace: true });
      }
    } catch (error) {
      console.error(error);
    }
  });

  byId("leave-button").addEventListener("click", () =>
    runWithButton("leave-button", async () => {
      if (!confirm("この依頼への参加を取り消しますか?")) return;
      await postAction(id, "leave", { userId });
      sharing.stop();
      soundCode.stop();
      navigateTo("./go-help.html?list=1");
    }),
  );
  byId("arrive-button").addEventListener("click", () =>
    runWithButton("arrive-button", async () => {
      await postAction(id, "arrive", { userId });
      sharing.stop();
      soundCode.stop();
      navigateTo(pageUrl("helper-gather.html", id));
    }),
  );
}

main()
  .catch((error) => {
    console.error(error);
    showError(`読み込めませんでした: ${error.message}`);
  })
  .finally(pageReady);
