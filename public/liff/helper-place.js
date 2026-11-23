// 【若者】参加した依頼の場所・詳細の動き。正確な住所と地図は、参加した人にだけ見せる。
// スリープなどから戻った瞬間に読み直し、雪かきが始まっていれば雪かき中の画面へ進む。
// 開いている間は、共有を選んだ人の現在地をお年寄りに送る(location-share.js)。到着・取り消しで止める。
// [到着しました] を押すと、音の合言葉(helper-sound-code.js)を鳴らす画面になる。お年寄りのスマホが聞き取ったら到着。
// [スキップして到着] で、合言葉なしでも到着にできる。
// 注意: 画面に文字を入れるときは必ず textContent を使う(innerHTML は使わない)。

import { byId } from "./common.js";
import { startSoundCode } from "./helper-sound-code.js";
import { startLocationShare } from "./location-share.js";
import { navigateTo, pageReady } from "./loading.js";
import { createMap, DETAIL_ZOOM, fitToPoints, pointOf, showPersonMarker, showPin } from "./map.js";
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
  return map;
}

/** 目的地の地図に「あなた」(自分の位置)を出す。位置が届くたびに動かし、家と自分が両方見えるようにする。 */
function createSelfMarker(map, home) {
  let marker = null;
  return (point) => {
    if (!map) return;
    if (marker) marker.setLatLng([point.lat, point.lng]);
    else marker = showPersonMarker(map, point, "あなた");
    fitToPoints(map, [home, point], DETAIL_ZOOM);
  };
}

/** 現在地の共有を始める(うまく始められなくても、参加はそのまま続ける)。 */
async function startSharing(id, userId, request, onPoint) {
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
      onPoint,
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
  const map = render(request);
  const sharing = await startSharing(id, userId, request, createSelfMarker(map, pointOf(request)));
  const goToGather = () => {
    sharing.stop();
    soundCode.stop();
    navigateTo(pageUrl("helper-gather.html", id));
  };
  const soundCode = startSoundCode({
    requestId: id,
    userId,
    onArrived: goToGather,
    // 合言葉なしで到着にする(お年寄りのスマホが聞き取れないとき)
    onSkip: async () => {
      await postAction(id, "arrive", { userId });
      goToGather();
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
  // 着いたら、合言葉を鳴らす画面へ(押した処理の中で鳴らし始める。スマホは押したときにしか音を出し始められない)
  byId("arrive-button").addEventListener("click", () => soundCode.start());
}

main()
  .catch((error) => {
    console.error(error);
    showError(`読み込めませんでした: ${error.message}`);
  })
  .finally(pageReady);
