// 画面の切り替えのクッション(ローディング)。見た目は loading.css。
// 使い方:
//   - 各画面の .js で import する(template.js を読む画面は自動で読み込まれる)
//   - 最初の表示がそろったら pageReady() を呼ぶ → 覆いが消えて中身が見える
//   - 別の画面へ移るときは location.href = 〜 の代わりに navigateTo(url) を使う(移る直前に覆いを出す)
//   - 同じサイトの <a href> を押したときは、何もしなくても覆いが出る
// 呼び忘れ・エラーで永遠に隠れないように、SAFETY_TIMEOUT_MS たつと自動で中身を見せる。
// このファイルはほかの .js を import しない(できるだけ早く動くように)。

const READY_CLASS = "page-ready";
/** pageReady() が呼ばれなくても、この時間がたったら中身を見せる(保険)。 */
const SAFETY_TIMEOUT_MS = 8000;

const root = document.documentElement;
/** 別の画面へ移っている途中か(移る途中で pageReady() が呼ばれても覆いを消さない)。 */
let isNavigating = false;
let safetyTimer = null;

/** 最初の表示がそろったら呼ぶ。覆いを消して中身を見せる(何回呼んでもよい)。 */
export function pageReady() {
  if (isNavigating) return;
  clearTimeout(safetyTimer);
  root.classList.add(READY_CLASS);
  root.removeAttribute("aria-busy");
}

/** 覆いを出して中身を隠す。 */
export function showLoading() {
  root.classList.remove(READY_CLASS);
  root.setAttribute("aria-busy", "true");
}

/** 覆いを出してから、別の画面へ移る。replace: true なら「戻る」で戻れないように移る。 */
export function navigateTo(url, { replace = false } = {}) {
  isNavigating = true;
  showLoading();
  if (replace) {
    location.replace(url);
  } else {
    location.assign(url);
  }
}

/** 覆いを出してから、今の画面を読み直す。 */
export function reloadPage() {
  isNavigating = true;
  showLoading();
  location.reload();
}

/** template.css を読まない画面(help-request.html)には、loading.css をここで足す。 */
function ensureStyles() {
  if (document.querySelector('link[href*="template.css"], link[href*="loading.css"]')) return;
  // loading.css が届くまでの間も中身を隠しておく
  const style = document.createElement("style");
  style.textContent = `html:not(.${READY_CLASS}) main { visibility: hidden; }`;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = new URL("./loading.css", import.meta.url).href;
  document.head.append(style, link);
}

/** 若者の画面(body.for-helper)以外は、明るい色の覆いにする。 */
function setTone() {
  root.dataset.loadingTone = document.body?.classList.contains("for-helper") ? "helper" : "elder";
}

/** 同じサイトの別の画面へのリンクを押したら、覆いを出す。 */
function onLinkClick(event) {
  if (event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
  if (!link || link.hasAttribute("download")) return;
  if (link.target && link.target !== "_self") return;
  const url = new URL(link.href, location.href);
  if (url.origin !== location.origin) return;
  const isSamePage = url.pathname === location.pathname && url.search === location.search;
  if (isSamePage && url.hash) return;
  isNavigating = true;
  showLoading();
}

function setUp() {
  ensureStyles();
  setTone();
  if (!root.classList.contains(READY_CLASS)) root.setAttribute("aria-busy", "true");
  safetyTimer = setTimeout(() => {
    console.warn(`${SAFETY_TIMEOUT_MS / 1000} 秒たっても準備が終わらなかったので、画面を見せます。`);
    pageReady();
  }, SAFETY_TIMEOUT_MS);
  // エラーで止まったときも、隠れたままにしない(エラー文は各画面が出す)
  window.addEventListener("error", pageReady);
  window.addEventListener("unhandledrejection", pageReady);
  document.addEventListener("click", onLinkClick);
  // 「戻る」で前の画面がそのまま戻ってきたとき(覆いが出たままの状態で保存されている)は、覆いを消す
  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    isNavigating = false;
    pageReady();
  });
}

setUp();
