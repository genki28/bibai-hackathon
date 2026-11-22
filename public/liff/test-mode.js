// テスト用の利用者の切り替え(1 台のスマホで、お年寄り役と若者役を行き来してテストするため)。
// サーバーの TEST_MODE が "true" のときだけ、画面の左下に小さな「🧪 テスト」ボタンを出す。
// - 押すと小窓で「いまの利用者」と選択肢(自分 / テスト用のお年寄り / テスト用の若者 A・B・C)を出す
// - 選ぶと localStorage に覚えて画面を読み直す。以後の画面は common.js の resolveProfile() がその人を使う
// - テスト用の利用者になっている間は、画面の上に「🧪 テスト中」の帯を出す
// - 「テストのデータを消す」で POST /api/test/reset(テスト用の利用者が関わったデータだけ消える)
// 各画面の .js で import するだけで動く(template.js を読む画面は自動で読み込まれる)。
// 注意: 画面に文字を入れるときは必ず textContent を使う(innerHTML は使わない)。

import {
  fetchAppConfig,
  getSelectedTestUserId,
  isPreviewMode,
  postJson,
  resolveOwnProfile,
  resolveProfile,
  setSelectedTestUserId,
} from "./common.js";
import { reloadPage } from "./loading.js";

const BUTTON_ID = "test-mode-button";
const BANNER_ID = "test-mode-banner";
const DIALOG_ID = "test-mode-dialog";

const STYLE = `
  #${BUTTON_ID} {
    position: fixed;
    left: calc(12px + env(safe-area-inset-left));
    bottom: calc(12px + env(safe-area-inset-bottom));
    z-index: 1600; /* 読み込み中の覆い(1500)より上。止まっても切り替えられるように */
    /* 各画面の button の見た目(横幅いっぱい・大きさ)を受け継がないように打ち消す */
    width: auto;
    min-height: 0;
    margin: 0;
    padding: 8px 12px;
    border: 1px dashed var(--reset-border, rgba(31, 41, 51, 0.35));
    border-radius: 999px;
    font: 600 0.8rem/1.2 system-ui, -apple-system, "Hiragino Sans", sans-serif;
    color: var(--reset-fg, #1f2933);
    background: var(--reset-bg, rgba(255, 255, 255, 0.92));
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    cursor: pointer;
  }
  /* 下のタブがある画面では、タブの上に浮かべる(「メニューを最初に戻す」ボタンと同じ高さ・反対側) */
  body.has-tab-bar #${BUTTON_ID} {
    bottom: calc(var(--tab-height, 64px) + 20px + env(safe-area-inset-bottom));
  }
  #${BANNER_ID} {
    position: fixed;
    top: 0;
    right: 0;
    left: 0;
    z-index: 1600;
    padding: calc(4px + env(safe-area-inset-top)) 12px 4px;
    font: 700 0.8rem/1.4 system-ui, -apple-system, "Hiragino Sans", sans-serif;
    text-align: center;
    color: #3d2a00;
    background: #ffc94d;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
  }
  body.has-test-banner {
    padding-top: calc(48px + env(safe-area-inset-top));
  }
  #${DIALOG_ID} {
    position: fixed;
    inset: 0;
    z-index: 1700;
    display: grid;
    place-items: center;
    padding: 16px;
    background: rgba(3, 6, 20, 0.6);
  }
  #${DIALOG_ID} .test-panel {
    width: min(100%, 360px);
    padding: 18px 16px;
    box-sizing: border-box;
    border-radius: 16px;
    font: 400 0.95rem/1.6 system-ui, -apple-system, "Hiragino Sans", sans-serif;
    color: #1f2933;
    background: #ffffff;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
  }
  #${DIALOG_ID} h2 {
    margin: 0 0 4px;
    font-size: 1.05rem;
  }
  #${DIALOG_ID} p {
    margin: 0 0 12px;
  }
  #${DIALOG_ID} button {
    display: block;
    width: 100%;
    min-height: 44px;
    margin: 0 0 8px;
    padding: 8px 12px;
    border: 1px solid #cbd2d9;
    border-radius: 10px;
    font: 600 0.95rem/1.4 system-ui, -apple-system, "Hiragino Sans", sans-serif;
    text-align: left;
    color: #1f2933;
    background: #f5f7fa;
    box-shadow: none;
    cursor: pointer;
  }
  #${DIALOG_ID} button[aria-pressed="true"] {
    border: 2px solid #2b6cb0;
    background: #e6f0fb;
  }
  #${DIALOG_ID} button.test-danger {
    margin-top: 16px;
    text-align: center;
    color: #ffffff;
    border-color: #c62a2f;
    background: #c62a2f;
  }
  #${DIALOG_ID} button.test-close {
    text-align: center;
    background: #ffffff;
  }
`;

function el(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function addStyle() {
  const style = document.createElement("style");
  style.textContent = STYLE;
  document.head.append(style);
}

function addBanner(profile) {
  const banner = el("div", `🧪 テスト中: ${profile.displayName} として操作しています`);
  banner.id = BANNER_ID;
  banner.setAttribute("role", "status");
  document.body.prepend(banner);
  document.body.classList.add("has-test-banner");
}

/** 利用者を切り替えて、今の画面を読み直す。 */
function switchUser(userId) {
  try {
    setSelectedTestUserId(userId);
    reloadPage();
  } catch (error) {
    alert(error.message);
  }
}

async function resetTestData(button) {
  const message =
    "テスト用の利用者が関わったデータ(依頼・役割・本人確認)を消しますか?\nほかの人のデータは消えません。元には戻せません。";
  if (!confirm(message)) return;
  button.disabled = true;
  try {
    const { deletedRequests } = await postJson("/api/test/reset", {});
    alert(`テストのデータを消しました(依頼 ${deletedRequests} 件)。`);
    reloadPage();
  } catch (error) {
    console.error(error);
    alert(`消せませんでした。\n${error.message}`);
    button.disabled = false;
  }
}

function choiceButton(label, userId, currentId) {
  const button = el("button", label);
  button.type = "button";
  button.setAttribute("aria-pressed", String(userId === currentId));
  button.addEventListener("click", () => switchUser(userId));
  return button;
}

function closeDialog() {
  document.getElementById(DIALOG_ID)?.remove();
}

async function openDialog(testUsers) {
  closeDialog();
  const [current, own] = await Promise.all([resolveProfile(), resolveOwnProfile()]);
  const currentTestId = current.isTestUser ? current.userId : "";

  const panel = el("div", undefined, "test-panel");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-label", "テスト用の利用者の切り替え");

  const resetButton = el("button", "🗑 テストのデータを消す", "test-danger");
  resetButton.type = "button";
  resetButton.addEventListener("click", () => resetTestData(resetButton));
  const closeButton = el("button", "とじる", "test-close");
  closeButton.type = "button";
  closeButton.addEventListener("click", closeDialog);

  panel.append(
    el("h2", "🧪 テスト用の利用者の切り替え"),
    el("p", `いまの利用者: ${current.displayName}`),
    choiceButton(`自分(LINE / ふだんの ID: ${own.displayName})`, "", currentTestId),
    ...testUsers.map((user) => choiceButton(user.label, user.userId, currentTestId)),
    resetButton,
    closeButton,
  );

  const backdrop = el("div");
  backdrop.id = DIALOG_ID;
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) closeDialog();
  });
  backdrop.append(panel);
  document.body.append(backdrop);
}

function addButton(testUsers) {
  const button = el("button", "🧪 テスト");
  button.id = BUTTON_ID;
  button.type = "button";
  button.addEventListener("click", () =>
    openDialog(testUsers).catch((error) => {
      console.error(error);
      alert(`切り替えの画面を出せませんでした。\n${error.message}`);
    }),
  );
  document.body.append(button);
}

async function setUpTestMode() {
  if (isPreviewMode() || document.getElementById(BUTTON_ID)) return;
  const config = await fetchAppConfig();
  if (!config.testMode) return;
  addStyle();
  addButton(config.testUsers);
  // テスト用の利用者を選んでいるときだけ帯を出す(プロフィールの準備を待つ)
  if (!getSelectedTestUserId()) return;
  const profile = await resolveProfile();
  if (profile.isTestUser) addBanner(profile);
}

setUpTestMode().catch((error) => console.error("テストモードの準備ができませんでした", error));
