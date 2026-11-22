// どの画面にも出る「メニューを最初に戻す」ボタン。
// 各画面の .js で `import "./reset-menu-button.js";` と書くだけで、右下に浮かんだボタンが出る。
// 押すと、その人の登録を取り消して、リッチメニューを最初(利用者登録)に戻す。

import { isPreviewMode, postJson, wait } from "./common.js";

const LIFF_READY_TIMEOUT_MS = 5000;
const BUTTON_ID = "reset-menu-button";

const STYLE = `
  #${BUTTON_ID} {
    position: fixed;
    right: calc(12px + env(safe-area-inset-right));
    bottom: calc(12px + env(safe-area-inset-bottom));
    z-index: 1000;
    /* 各画面の button の見た目(横幅いっぱい・大きさ)を受け継がないように打ち消す */
    width: auto;
    min-height: 0;
    margin: 0;
    padding: 8px 12px;
    /* 色は template.css の --reset-〇〇 で画面に合わせる(ない画面ではこの白っぽい色) */
    border: 1px solid var(--reset-border, rgba(31, 41, 51, 0.2));
    border-radius: 999px;
    font: 600 0.8rem/1.2 system-ui, -apple-system, "Hiragino Sans", sans-serif;
    color: var(--reset-fg, #1f2933);
    background: var(--reset-bg, rgba(255, 255, 255, 0.92));
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    -webkit-backdrop-filter: blur(8px);
    backdrop-filter: blur(8px);
    cursor: pointer;
  }
  #${BUTTON_ID}:disabled {
    opacity: 0.6;
  }
`;

/** LIFF の準備(liff.init)が終わるのを待つ。各画面が init を呼ぶので、ここでは待つだけ。 */
async function waitForLiff() {
  const liff = window.liff;
  if (!liff) throw new Error("LINE の部品を読み込めませんでした。");
  const timeout = wait(LIFF_READY_TIMEOUT_MS).then(() => {
    throw new Error("LINE の準備が終わりませんでした。画面を開き直してください。");
  });
  await Promise.race([liff.ready, timeout]);
  return liff;
}

async function getIdToken() {
  const liff = await waitForLiff();
  if (!liff.isLoggedIn()) {
    throw new Error("LINE の中で画面を開いてから押してください。");
  }
  const idToken = liff.getIDToken();
  if (!idToken) {
    throw new Error("LINE の本人確認ができませんでした(LIFF の設定で openid を有効にしてください)。");
  }
  return { liff, idToken };
}

async function resetMenu(button) {
  if (isPreviewMode()) {
    alert("おためし表示では、メニューは戻せません。");
    return;
  }
  if (!confirm("メニューを最初(利用者登録)に戻しますか?\n登録した内容は取り消されます。")) return;

  button.disabled = true;
  try {
    const { liff, idToken } = await getIdToken();
    await postJson("/api/users/reset-menu", { idToken });
    alert("メニューを最初に戻しました。トーク画面で確かめてください。");
    if (liff.isInClient()) liff.closeWindow();
  } catch (error) {
    console.error(error);
    alert(`メニューを戻せませんでした。\n${error.message}`);
  } finally {
    button.disabled = false;
  }
}

function addResetMenuButton() {
  if (document.getElementById(BUTTON_ID)) return;
  const style = document.createElement("style");
  style.textContent = STYLE;
  document.head.append(style);

  const button = document.createElement("button");
  button.id = BUTTON_ID;
  button.type = "button";
  button.textContent = "↺ メニューを最初に戻す";
  button.addEventListener("click", () => resetMenu(button));
  document.body.append(button);
}

addResetMenuButton();
