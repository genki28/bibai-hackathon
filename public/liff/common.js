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

const TEST_USER_KEY = "bibai-test-user-id";
const EMPTY_CONFIG = { liffId: "", testMode: false, testUsers: [] };

async function fetchConfig() {
  const response = await fetch("/api/config");
  if (!response.ok) throw new Error(`設定を取得できませんでした(${response.status})`);
  const body = await response.json();
  const data = body?.data ?? {};
  return {
    liffId: data.liffId ?? "",
    testMode: data.testMode === true,
    testUsers: Array.isArray(data.testUsers) ? data.testUsers : [],
  };
}

let configPromise = null;

/** サーバーの設定 { liffId, testMode, testUsers }(1 回だけ取ってきて覚えておく)。おためし表示では空。 */
export function fetchAppConfig() {
  configPromise ??= isPreviewMode() ? Promise.resolve(EMPTY_CONFIG) : fetchConfig();
  return configPromise;
}

/** LINE の外で使う表示名(「ゲスト」+ ID の末尾 4 文字)。 */
const guestProfile = (userId) => ({ userId, displayName: `ゲスト${userId.slice(-4)}` });

async function loadOwnProfile() {
  const liff = window.liff;
  const liffId = liff && !isPreviewMode() ? (await fetchAppConfig()).liffId : "";
  if (!liffId) return guestProfile(getGuestUserId());
  await liff.init({ liffId });
  if (!liff.isLoggedIn()) return guestProfile(getGuestUserId());
  const profile = await liff.getProfile();
  return { userId: profile.userId, displayName: profile.displayName || guestProfile(profile.userId).displayName };
}

/** いま選んでいるテスト用の利用者の ID(🧪 テストの小窓で選ぶ)。選んでいなければ空文字。 */
export function getSelectedTestUserId() {
  try {
    return localStorage.getItem(TEST_USER_KEY) ?? "";
  } catch {
    return "";
  }
}

/** テスト用の利用者を選ぶ。空文字なら「自分」に戻す。 */
export function setSelectedTestUserId(userId) {
  try {
    if (userId) {
      localStorage.setItem(TEST_USER_KEY, userId);
    } else {
      localStorage.removeItem(TEST_USER_KEY);
    }
  } catch (error) {
    console.error(error);
    throw new Error("この端末では切り替えを覚えておけませんでした。");
  }
}

/** テストモードで、テスト用の利用者を選んでいればそのプロフィール。そうでなければ null。 */
async function loadTestProfile() {
  const selected = getSelectedTestUserId();
  if (!selected) return null;
  const config = await fetchAppConfig();
  if (!config.testMode) return null; // テストモードが切られたら、選んでいても使わない
  const user = config.testUsers.find((u) => u.userId === selected);
  return user ? { userId: user.userId, displayName: user.displayName, isTestUser: true } : null;
}

async function loadProfile() {
  const own = await resolveOwnProfile();
  return (await loadTestProfile()) ?? own;
}

let ownProfilePromise = null;
let profilePromise = null;

/**
 * 本当にこの画面を開いている人(テスト用の利用者を選んでいても、自分)の { userId, displayName }。
 * LIFF の準備(liff.init)は 1 回だけにしたいので、結果を覚えておく。
 */
export function resolveOwnProfile() {
  ownProfilePromise ??= loadOwnProfile();
  return ownProfilePromise;
}

/**
 * この画面で使う人の { userId, displayName }。
 * LINE にログインしていれば本物、していなければ仮の ID と「ゲスト〇〇〇〇」。
 * テストモードでテスト用の利用者を選んでいれば、その人(isTestUser: true が付く)。
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

/**
 * ドット絵のアイコン(icons/〇〇.svg。ChatGPT で作ったもの)の <img>。飾りなので読み上げない。
 * @param {string} name アイコンの名前(icons/ のファイル名から .svg を除いたもの)
 * @param {string} [className] 大きく出すときは "ui-icon is-big"
 */
export function icon(name, className = "ui-icon") {
  const img = document.createElement("img");
  img.src = new URL(`./icons/${name}.svg`, import.meta.url).href;
  img.alt = "";
  img.className = className;
  img.setAttribute("aria-hidden", "true");
  return img;
}

/** 要素の中身を「アイコン + 文字」にする(文字は textContent と同じく、そのまま文字として入る)。 */
export function setIconText(element, name, text) {
  element.replaceChildren(icon(name), text);
}
