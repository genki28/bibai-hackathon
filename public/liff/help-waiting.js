// 【お年寄り】助けを呼んだ後の待機画面の動き(ひな形)。
// いまは自分の依頼を読み込んで表示するだけ。取り消しは画面が切り替わるだけで、まだ保存はしない。

import { byId, callApi, isPreviewMode } from "./common.js";
import { userIdPromise } from "./template.js";

const AMOUNT_LABELS = { little: "すこし", normal: "ふつう", lots: "たくさん" };

async function showMyRequest() {
  if (isPreviewMode()) return;
  const userId = await userIdPromise;
  const request = await callApi(`/api/help-requests/mine/${userId}`);
  if (!request) {
    byId("request-status").textContent = "いまは、おねがいしている雪かきはありません。";
    return;
  }
  const createdAt = new Date(request.createdAt).toLocaleString("ja-JP");
  byId("request-status").textContent = "受注状況: お待ちください";
  byId("request-detail").textContent = `雪の多さ: ${AMOUNT_LABELS[request.amount] ?? "-"} / おねがいした時刻: ${createdAt}`;
}

function onCancel() {
  if (!confirm("雪かきのおねがいを取り消しますか?")) return;
  // TODO: 取り消しを保存する API を作ったら、ここで呼ぶ
  byId("step-waiting").hidden = true;
  byId("step-cancelled").hidden = false;
}

byId("cancel-button").addEventListener("click", onCancel);
showMyRequest().catch((error) => {
  console.error(error);
  byId("request-status").textContent = "様子を読み込めませんでした。画面を開き直してください。";
});
