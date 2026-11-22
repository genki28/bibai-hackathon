// お年寄り向け「助けを呼ぶ」フォームの動き。
// 見た目を変えるときは help-request.html だけを触れば OK。このファイルは基本的に変えない。
//
// HTML 側で必要なもの(id や name を変えると動かなくなります):
//   id="step-ask" / "step-sending" / "step-done" … 3 つの画面
//   id="call-button" / "cancel-button" / "close-button" … ボタン
//   id="error" … エラーを出す場所
//   id="preview-note" … おためし表示の注意書き
//   name="amount" の選択肢(value は "little" / "normal" / "lots")

import { byId, callApi, closeScreen, isPreviewMode, postJson, resolveUserId, wait } from "./common.js";
import "./reset-menu-button.js";

const STEPS = ["ask", "sending", "done"];
const PREVIEW_DELAY_MS = 1000;
const WAITING_PAGE = "./help-waiting.html";

function showStep(name) {
  STEPS.forEach((step) => {
    byId(`step-${step}`).hidden = step !== name;
  });
}

function showError(message) {
  const error = byId("error");
  error.textContent = message;
  error.hidden = message === "";
}

function selectedAmount() {
  return document.querySelector('input[name="amount"]:checked')?.value ?? "normal";
}

/** 依頼を送る。おためし表示のときは送らずに、送れたふりをする。 */
async function sendRequest(userIdPromise) {
  if (isPreviewMode()) {
    await wait(PREVIEW_DELAY_MS);
    return;
  }
  const userId = await userIdPromise;
  await postJson("/api/help-requests", { userId, amount: selectedAmount() });
}

async function onCall(userIdPromise) {
  showError("");
  showStep("sending");
  try {
    await sendRequest(userIdPromise);
    if (isPreviewMode()) {
      showStep("done");
      return;
    }
    // 送れたら待機画面へ
    location.href = WAITING_PAGE;
  } catch (error) {
    console.error(error);
    showStep("ask");
    showError(`うまく送れませんでした。もう一度「よぶ」を押してください。(${error.message})`);
  }
}

/** すでに助けを呼んでいる人は、フォームではなく待機画面を出す。 */
async function goToWaitingIfAlreadyCalled(userIdPromise) {
  const userId = await userIdPromise;
  const mine = await callApi(`/api/help-requests/mine/${userId}`);
  if (mine) location.replace(WAITING_PAGE);
}

function main() {
  byId("preview-note").hidden = !isPreviewMode();
  // ユーザー ID は裏で先に取っておく(ボタンを押したときに待たせないため)
  const userIdPromise = isPreviewMode() ? Promise.resolve("") : resolveUserId();
  userIdPromise.catch((error) => console.error(error));
  if (!isPreviewMode()) {
    goToWaitingIfAlreadyCalled(userIdPromise).catch((error) => console.error(error));
  }

  byId("call-button").addEventListener("click", () => onCall(userIdPromise));
  byId("cancel-button").addEventListener("click", closeScreen);
  byId("close-button").addEventListener("click", closeScreen);
  showStep("ask");
}

main();
