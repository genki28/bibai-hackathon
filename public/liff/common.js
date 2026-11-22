// LIFF 画面で共通に使う処理。各画面の .js から import して使う。
// 注意: 画面に文字を入れるときは必ず textContent を使う(innerHTML は使わない)。

const GUEST_ID_KEY = "bibai-guest-user-id";

export const byId = (id) => document.getElementById(id);

export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * デザインのおためし表示か。URL の最後に ?preview を付けると、API を呼ばずに動きだけ確かめられる。
 * 例: python -m http.server 8000 で public/liff を開き、http://localhost:8000/help-request.html?preview
 */
export const isPreviewMode = () =>
  new URLSearchParams(location.search).has("preview") || location.protocol === "file:";

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

/** LINE の外で使う表示名(「ゲスト」+ ID の末尾 4 文字)。 */
const guestProfile = (userId) => ({ userId, displayName: `ゲスト${userId.slice(-4)}` });

async function loadProfile() {
  const liff = window.liff;
  const liffId = liff && !isPreviewMode() ? await fetchLiffId() : "";
  if (!liffId) return guestProfile(getGuestUserId());
  await liff.init({ liffId });
  if (!liff.isLoggedIn()) return guestProfile(getGuestUserId());
  const profile = await liff.getProfile();
  return { userId: profile.userId, displayName: profile.displayName || guestProfile(profile.userId).displayName };
}

let profilePromise = null;

/**
 * この画面を開いている人の { userId, displayName }。
 * LINE にログインしていれば本物、していなければ仮の ID と「ゲスト〇〇〇〇」。
 * LIFF の準備(liff.init)は 1 回だけにしたいので、結果を覚えておく。
 */
export function resolveProfile() {
  profilePromise ??= loadProfile();
  return profilePromise;
}

/** LINE にログインしていれば本物のユーザー ID、していなければ仮の ID を使う。 */
export async function resolveUserId() {
  const profile = await resolveProfile();
  return profile.userId;
}

/** サーバーの API を呼ぶ。失敗したら日本語のエラーを投げる。 */
export async function callApi(path, options) {
  const response = await fetch(path, options);
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.success) {
    throw new Error(body?.error ?? `通信に失敗しました(${response.status})`);
  }
  return body.data;
}

/** JSON を POST する。 */
export const postJson = (path, data) =>
  callApi(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });

/** LINE の中なら画面を閉じ、そうでなければ前の画面に戻る。 */
export function closeScreen() {
  const liff = window.liff;
  if (liff?.isInClient?.()) {
    liff.closeWindow();
    return;
  }
  history.back();
}
