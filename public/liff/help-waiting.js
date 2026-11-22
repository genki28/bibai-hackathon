// 【お年寄り】助けを呼んだ後の待機画面の動き。
// 自分の依頼を数秒ごとに読み直して、受注状況を出す。取り消しは本当に保存する(API)。
// 注意: 画面に文字を入れるときは必ず textContent を使う(innerHTML は使わない)。

import { byId, callApi, isPreviewMode } from "./common.js";
import { pageReady } from "./loading.js";
import { pageUrl, postAction, showError, startPolling } from "./request-page.js";
import { userIdPromise } from "./template.js";

const POLL_INTERVAL_MS = 4000;
const AMOUNT_LABELS = { little: "すこし", normal: "ふつう", lots: "たくさん" };

/** 状態ごとの見出しとアイコン。 */
const STATUS_VIEWS = {
  waiting: { icon: "⏳", text: "お待ちください" },
  accepted: { icon: "🙌", text: "受注が完了しました" },
  working: { icon: "⛄", text: "雪かき中です" },
  done: { icon: "🎉", text: "雪かきが終わりました" },
};

let stopPolling = () => {};

const names = (request) => request.helpers.map((h) => `${h.displayName} さん`).join("、");

function helpersText(request) {
  if (request.status === "accepted") return `${names(request)}が向かっています。`;
  if (request.status === "working" || request.status === "done") return `${names(request)}が来てくれました。`;
  return "";
}

function render(request) {
  // 進みぐあいの表示(help-waiting.html の .elder-steps)の色分けに使う
  document.body.dataset.status = request?.status ?? "none";
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

async function refresh(userId) {
  const request = await callApi(`/api/help-requests/mine/${userId}`);
  showError("");
  render(request);
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
    byId("step-waiting").hidden = true;
    byId("step-cancelled").hidden = false;
  } catch (error) {
    console.error(error);
    showError(`取り消せませんでした: ${error.message}`);
  } finally {
    button.disabled = false;
  }
}

async function main() {
  byId("cancel-button").addEventListener("click", onCancel);
  if (isPreviewMode()) {
    render({ id: "", status: "waiting", amount: "normal", createdAt: new Date().toISOString(), helpers: [] });
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
