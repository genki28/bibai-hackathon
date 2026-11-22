// 【お年寄り】助けを呼んだ後の待機画面の動き。
// 自分の依頼を数秒ごとに読み直して、受注状況を出す。取り消しは本当に保存する(API)。
// 向かっている人がいる間は、その人の現在地と到着の目安も出す(elder-live-map.js)。
// 注意: 画面に文字を入れるときは必ず textContent を使う(innerHTML は使わない)。

import { byId, callApi, isPreviewMode } from "./common.js";
import { createElderLiveMap } from "./elder-live-map.js";
import { pageReady } from "./loading.js";
import { pageUrl, postAction, showError, startPolling } from "./request-page.js";
import { userIdPromise } from "./template.js";

const POLL_INTERVAL_MS = 4000;
const AMOUNT_LABELS = { little: "すこし", normal: "ふつう", lots: "たくさん" };

/** 状態ごとの見出しとアイコン。 */
const STATUS_VIEWS = {
  waiting: { icon: "⏳", text: "お手伝いする人を\n探しています" },
  accepted: { icon: "🙌", text: "お手伝いする人が\n向かっています" },
  working: { icon: "⛄", text: "雪かき中です" },
  done: { icon: "🎉", text: "雪かきが終わりました" },
};

let stopPolling = () => {};
const liveMap = createElderLiveMap();

const names = (request) => request.helpers.map((h) => `${h.displayName} さん`).join("、");

function helpersText(request) {
  if (request.status === "accepted") return `${names(request)}が向かっています。`;
  if (request.status === "working" || request.status === "done") return `${names(request)}が来てくれました。`;
  return "";
}

function render(request) {
  // 進みぐあいの表示(help-waiting.html の .elder-steps)の色分けに使う
  document.body.dataset.status = request?.status ?? "none";
  byId("waiting-title").textContent = request ? "おねがいを\n受け付けました" : "雪かきの\nおねがい状況";
  const steps = document.querySelector(".elder-steps");
  steps.hidden = !request;
  steps.querySelectorAll("li").forEach((step) => {
    if (step.dataset.step === request?.status) step.setAttribute("aria-current", "step");
    else step.removeAttribute("aria-current");
  });
  if (!request) {
    byId("status-icon").textContent = "🏠";
    byId("request-status").textContent = "いまは、おねがいしている雪かきはありません。";
    byId("request-helpers").textContent = "";
    byId("request-detail").textContent = "";
    byId("cancel-button").hidden = true;
    byId("thanks-link").hidden = true;
    return;
  }
  const view = STATUS_VIEWS[request.status] ?? STATUS_VIEWS.waiting;
  byId("status-icon").textContent = view.icon;
  byId("request-status").textContent = view.text;
  byId("request-helpers").textContent = helpersText(request);
  const createdAt = new Date(request.createdAt).toLocaleString("ja-JP");
  byId("request-detail").textContent = `雪の多さ: ${AMOUNT_LABELS[request.amount] ?? "-"} / おねがいした時刻: ${createdAt}`;
  byId("cancel-button").hidden = request.status === "done";
  byId("thanks-link").hidden = request.status !== "done";
  byId("thanks-link").href = pageUrl("thanks.html", request.id);
}

/** 受注状況と、来てくれる人の現在地を出す(地図が出せなくても受注状況は出す)。 */
function renderAll(request) {
  render(request);
  try {
    liveMap.update(request);
  } catch (error) {
    console.error("現在地の地図を出せませんでした", error);
  }
}

async function refresh(userId) {
  const request = await callApi(`/api/help-requests/mine/${userId}`);
  showError("");
  renderAll(request);
  return false;
}

async function onCancel() {
  if (!confirm("雪かきのおねがいを取り消しますか?")) return;
  const button = byId("cancel-button");
  button.disabled = true;
  try {
    const userId = await userIdPromise;
    const request = await callApi(`/api/help-requests/mine/${userId}`);
    if (request) await postAction(request.id, "cancel", { userId });
    stopPolling();
    liveMap.update(null);
    byId("step-waiting").hidden = true;
    byId("step-cancelled").hidden = false;
  } catch (error) {
    console.error(error);
    showError(`取り消せませんでした: ${error.message}`);
  } finally {
    button.disabled = false;
  }
}

function previewRequest(status, helpers) {
  return { id: "", status, amount: "normal", createdAt: new Date().toISOString(), lat: 43.33, lng: 141.853, helpers };
}

/** おためし表示用: 2 人が向かっていて(1 人は位置の共有なし)、1 人が着いた様子。 */
function previewLiveRequest() {
  const at = new Date(Date.now() - 60_000).toISOString();
  return previewRequest("accepted", [
    { displayName: "雪野 太郎", arrivedAt: null, location: { lat: 43.334, lng: 141.848, accuracy: 20, at } },
    { displayName: "美唄 花子", arrivedAt: null },
    { displayName: "北 一郎", arrivedAt: at },
  ]);
}

async function main() {
  byId("cancel-button").addEventListener("click", onCancel);
  if (isPreviewMode()) {
    // ?preview=live なら、向かっている人がいるときの見た目(現在地の地図)を見せる
    const isLive = new URLSearchParams(location.search).get("preview") === "live";
    renderAll(isLive ? previewLiveRequest() : previewRequest("waiting", []));
    pageReady();
    return;
  }
  const userId = await userIdPromise;
  // 1 回目の様子がそろったら画面を見せる
  stopPolling = startPolling(
    () => refresh(userId),
    POLL_INTERVAL_MS,
    () => showError("様子を読み込めませんでした。しばらくすると、もう一度ためします。"),
    pageReady,
  );
}

main().catch((error) => {
  console.error(error);
  pageReady();
  showError("様子を読み込めませんでした。画面を開き直してください。");
});
