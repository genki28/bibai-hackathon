// 本人確認(マイナンバーカード)のデモ画面の動き。
// ⚠ 実際のカード読み取りはしていません。「かざした」ボタンで、読み取れたことにして進みます。
// 注意: 画面に文字を入れるときは必ず textContent を使う(innerHTML は使わない)。

import { byId, callApi, postJson, resolveUserId, wait } from "./common.js";
import "./reset-menu-button.js";

const STEPS = ["loading", "intro", "scan", "checking", "done"];
const CHECKING_DELAY_MS = 1500;

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

const fetchStatus = (userId) => callApi(`/api/identity/${userId}`);

const markVerified = (userId) => postJson("/api/identity/mock-verify", { userId });

/** ?next=〇〇.html で次の画面が指定されていれば返す(同じフォルダの .html だけ許す)。 */
function nextPage() {
  const next = new URLSearchParams(location.search).get("next") ?? "";
  return /^[a-z0-9-]+\.html$/.test(next) ? `./${next}` : null;
}

function showDone(status) {
  const date = new Date(status.verifiedAt);
  byId("verified-at").textContent = `確認日時: ${date.toLocaleString("ja-JP")}`;
  const next = nextPage();
  byId("next-button").hidden = next === null;
  showStep("done");
}

async function verify(userId) {
  showError("");
  showStep("checking");
  try {
    await wait(CHECKING_DELAY_MS);
    showDone(await markVerified(userId));
  } catch (error) {
    showStep("scan");
    showError(`確認できませんでした: ${error.message}`);
  }
}

async function main() {
  const userId = await resolveUserId();
  const status = await fetchStatus(userId);

  byId("start-button").addEventListener("click", () => showStep("scan"));
  byId("cancel-button").addEventListener("click", () => showStep("intro"));
  byId("scan-button").addEventListener("click", () => verify(userId));
  byId("reset-button").addEventListener("click", () => showStep("intro"));
  byId("next-button").addEventListener("click", () => {
    const next = nextPage();
    if (next) location.href = next;
  });

  if (status.verified) {
    showDone(status);
  } else {
    showStep("intro");
  }
}

main().catch((error) => {
  console.error(error);
  showStep("intro");
  showError(`エラーが起きました: ${error instanceof Error ? error.message : String(error)}`);
});
