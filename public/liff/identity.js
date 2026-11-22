// 本人確認(マイナンバーカード)のデモ画面の動き。
// ⚠ 実際のカード読み取りはしていません。「かざした」ボタンで、読み取れたことにして進みます。
// 注意: 画面に文字を入れるときは必ず textContent を使う(innerHTML は使わない)。

const STEPS = ["loading", "intro", "scan", "checking", "done"];
const CHECKING_DELAY_MS = 1500;
const GUEST_ID_KEY = "bibai-guest-user-id";

const byId = (id) => document.getElementById(id);

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

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** LINE の外(PC のブラウザなど)で試すとき用の、仮のユーザー ID。 */
function createGuestUserId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `U${hex}`;
}

function getGuestUserId() {
  try {
    const saved = localStorage.getItem(GUEST_ID_KEY);
    if (saved) return saved;
    const created = createGuestUserId();
    localStorage.setItem(GUEST_ID_KEY, created);
    return created;
  } catch {
    return createGuestUserId();
  }
}

async function fetchLiffId() {
  const response = await fetch("/api/config");
  if (!response.ok) throw new Error(`設定を取得できませんでした(${response.status})`);
  const body = await response.json();
  return body?.data?.liffId ?? "";
}

/** LINE にログインしていれば本物のユーザー ID、していなければ仮の ID を使う。 */
async function resolveUserId() {
  const liff = window.liff;
  const liffId = liff ? await fetchLiffId() : "";
  if (!liffId) return getGuestUserId();
  await liff.init({ liffId });
  if (!liff.isLoggedIn()) return getGuestUserId();
  const profile = await liff.getProfile();
  return profile.userId;
}

async function callApi(path, options) {
  const response = await fetch(path, options);
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.success) {
    throw new Error(body?.error ?? `通信に失敗しました(${response.status})`);
  }
  return body.data;
}

const fetchStatus = (userId) => callApi(`/api/identity/${userId}`);

const markVerified = (userId) =>
  callApi("/api/identity/mock-verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId }),
  });

function showDone(status) {
  const date = new Date(status.verifiedAt);
  byId("verified-at").textContent = `確認日時: ${date.toLocaleString("ja-JP")}`;
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
