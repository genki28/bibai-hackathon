// お年寄り向け「助けを呼ぶ」フォームの動き。
// 見た目を変えるときは help-request.html だけを触れば OK。このファイルは基本的に変えない。
//
// HTML 側で必要なもの(id や name を変えると動かなくなります):
//   id="step-ask" / "step-sending" / "step-done" … 3 つの画面
//   id="call-button" / "cancel-button" / "close-button" … ボタン
//   id="error" … エラーを出す場所
//   id="preview-note" … おためし表示の注意書き
//   name="amount" の選択肢(value は "little" / "normal" / "lots")
//
// HTML にあれば送るもの(なくても動きます。詳しくは docs/guides/help-request-form-for-gemini.md):
//   name="name"(名前)/ "address"(住所)/ "depth"(雪の深さ)/ "tools"(道具)
//   name="lat" / "lng"(緯度・経度。ふつうは hidden。id="use-location-button" を押すと現在地が入る)

// 読み込み中の覆いを一番先に出す(help-request.html は template.css を読まないので、ここで中身を隠す)
import { navigateTo, pageReady } from "./loading.js";
import { byId, callApi, closeScreen, isPreviewMode, postJson, resolveUserId, wait } from "./common.js";
import "./reset-menu-button.js";
import "./test-mode.js";

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

const TEXT_FIELDS = ["name", "address", "depth", "tools"];
const NUMBER_FIELDS = ["lat", "lng"];

const fieldSelector = (name) => ["input", "select", "textarea"].map((tag) => `${tag}[name="${name}"]`).join(",");

/** name="〇〇" の入力の値。ラジオボタンなら選ばれているもの。なければ空文字。 */
function fieldValue(name) {
  const fields = [...document.querySelectorAll(fieldSelector(name))];
  const field = fields.find((f) => f.type !== "radio" && f.type !== "checkbox") ?? fields.find((f) => f.checked);
  return (field?.value ?? "").trim();
}

/** HTML にある任意の項目だけを集める(空のものは送らない)。 */
function optionalFields() {
  const texts = TEXT_FIELDS.map((name) => [name, fieldValue(name)]).filter(([, v]) => v !== "");
  const numbers = NUMBER_FIELDS.map((name) => [name, fieldValue(name)])
    .filter(([, v]) => v !== "" && Number.isFinite(Number(v)))
    .map(([name, v]) => [name, Number(v)]);
  // 緯度と経度はそろっているときだけ送る
  const location = numbers.length === NUMBER_FIELDS.length ? numbers : [];
  return Object.fromEntries([...texts, ...location]);
}

/** id="use-location-button" があれば、押したときに現在地を name="lat" / "lng" に入れる。 */
function setUpLocationButton() {
  const button = byId("use-location-button");
  if (!button) return;
  button.addEventListener("click", () => {
    if (!navigator.geolocation) {
      showError("この端末では現在地を取れません。");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const lat = document.querySelector(fieldSelector("lat"));
        const lng = document.querySelector(fieldSelector("lng"));
        if (lat) lat.value = String(coords.latitude);
        if (lng) lng.value = String(coords.longitude);
        showError("");
        button.textContent = "現在地を入れました";
      },
      () => showError("現在地を取れませんでした。住所だけでも大丈夫です。"),
    );
  });
}

/** 依頼を送る。おためし表示のときは送らずに、送れたふりをする。 */
async function sendRequest(userIdPromise) {
  if (isPreviewMode()) {
    await wait(PREVIEW_DELAY_MS);
    return;
  }
  const userId = await userIdPromise;
  await postJson("/api/help-requests", { ...optionalFields(), userId, amount: selectedAmount() });
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
    navigateTo(WAITING_PAGE);
  } catch (error) {
    console.error(error);
    showStep("ask");
    showError(`うまく送れませんでした。もう一度「よぶ」を押してください。(${error.message})`);
  }
}

/** すでに助けを呼んでいる人は、フォームではなく待機画面を出す(フォームは見せないまま移る)。 */
async function goToWaitingIfAlreadyCalled(userIdPromise) {
  const userId = await userIdPromise;
  const mine = await callApi(`/api/help-requests/mine/${userId}`);
  if (mine) navigateTo(WAITING_PAGE, { replace: true });
}

function main() {
  byId("preview-note").hidden = !isPreviewMode();
  // ユーザー ID は裏で先に取っておく(ボタンを押したときに待たせないため)
  const userIdPromise = isPreviewMode() ? Promise.resolve("") : resolveUserId();
  userIdPromise.catch((error) => console.error(error));

  setUpLocationButton();
  byId("call-button").addEventListener("click", () => onCall(userIdPromise));
  byId("cancel-button").addEventListener("click", closeScreen);
  byId("close-button").addEventListener("click", closeScreen);
  showStep("ask");

  if (isPreviewMode()) {
    pageReady();
    return;
  }
  // すでに呼んでいるか確かめてから、フォームを見せる(待機画面へ移るときは見せない)
  goToWaitingIfAlreadyCalled(userIdPromise)
    .catch((error) => console.error(error))
    .finally(pageReady);
}

try {
  main();
} catch (error) {
  console.error(error);
  pageReady();
  showError(`画面を準備できませんでした。開き直してください。(${error.message})`);
}
