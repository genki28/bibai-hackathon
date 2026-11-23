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
//   name="lat" / "lng"(緯度・経度。ふつうは hidden。id="use-location-button" を押すと現在地が入る。
//     id="location-display" に結果の文字、id="location-map" に地図とピンを出す)
//   name="tools" がなければ、data-tool="道具の名前" のチェックと、同じ .tool-item の中の .tool-count(数)をまとめて送る
//   name="amount" はラジオボタンでも選択欄(select)でもよい

// 読み込み中の覆いを一番先に出す(help-request.html は template.css を読まないので、ここで中身を隠す)
import { navigateTo, pageReady } from "./loading.js";
import { byId, callApi, closeScreen, isPreviewMode, postJson, resolveUserId, wait } from "./common.js";
import { amountOf, toolsTextOf } from "./help-request-fields.js";
import { createMap, DETAIL_ZOOM, showPin } from "./map.js";
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


const TEXT_FIELDS = ["name", "address", "depth", "tools"];
const NUMBER_FIELDS = ["lat", "lng"];

/** 位置を取るのを待つ長さ(ミリ秒)。 */
const LOCATION_TIMEOUT_MS = 15_000;

const fieldSelector = (name) => ["input", "select", "textarea"].map((tag) => `${tag}[name="${name}"]`).join(",");

/** name="〇〇" の入力の値。ラジオボタンなら選ばれているもの。なければ空文字。 */
function fieldValue(name) {
  const fields = [...document.querySelectorAll(fieldSelector(name))];
  const field = fields.find((f) => f.type !== "radio" && f.type !== "checkbox") ?? fields.find((f) => f.checked);
  return (field?.value ?? "").trim();
}

/** 雪の深さ(ラジオボタンでも選択欄でもよい)。 */
const selectedAmount = () => amountOf(fieldValue("amount"));

/** name="tools" があればその値、なければ data-tool のチェックと数をまとめた文字。 */
function toolsValue() {
  const typed = fieldValue("tools");
  if (typed !== "") return typed;
  const items = [...document.querySelectorAll("input[data-tool]")].map((checkbox) => ({
    label: checkbox.dataset.tool,
    isChecked: checkbox.checked,
    count: Number.parseInt(checkbox.closest(".tool-item")?.querySelector(".tool-count")?.value ?? "", 10),
  }));
  return toolsTextOf(items);
}

/** HTML にある任意の項目だけを集める(空のものは送らない)。 */
function optionalFields() {
  const texts = TEXT_FIELDS.map((name) => [name, name === "tools" ? toolsValue() : fieldValue(name)]).filter(
    ([, v]) => v !== "",
  );
  const numbers = NUMBER_FIELDS.map((name) => [name, fieldValue(name)])
    .filter(([, v]) => v !== "" && Number.isFinite(Number(v)))
    .map(([name, v]) => [name, Number(v)]);
  // 緯度と経度はそろっているときだけ送る
  const location = numbers.length === NUMBER_FIELDS.length ? numbers : [];
  return Object.fromEntries([...texts, ...location]);
}

/** 位置の結果の文字を出す(id="location-display" があれば)。 */
function showLocationText(text) {
  const display = byId("location-display");
  if (display) display.textContent = text;
}

/** 取った位置を地図にピンで出す(id="location-map" があれば。地図が出せなくても位置は送れる)。 */
let locationMap = null;
function showLocationMap(point) {
  const box = byId("location-map");
  if (!box) return;
  box.hidden = false;
  try {
    if (!locationMap) {
      locationMap = { map: createMap(box, point, DETAIL_ZOOM), marker: null };
    }
    const { map } = locationMap;
    if (!map) return;
    map.setView([point.lat, point.lng], DETAIL_ZOOM);
    map.invalidateSize();
    locationMap.marker?.remove();
    locationMap.marker = showPin(map, point, "ここ");
  } catch (error) {
    console.error("地図を出せませんでした", error);
  }
}

/** id="use-location-button" があれば、押したときに現在地を name="lat" / "lng" に入れ、地図に出す。 */
function setUpLocationButton() {
  const button = byId("use-location-button");
  if (!button) return;
  button.addEventListener("click", () => {
    if (!navigator.geolocation) {
      showLocationText("この端末では現在地を取れません。");
      return;
    }
    button.disabled = true;
    showLocationText("現在地を調べています…");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const lat = document.querySelector(fieldSelector("lat"));
        const lng = document.querySelector(fieldSelector("lng"));
        if (lat) lat.value = String(coords.latitude);
        if (lng) lng.value = String(coords.longitude);
        showError("");
        button.disabled = false;
        button.textContent = "📍 もう一度取得";
        showLocationText(`📍 現在地を入れました(誤差 約 ${Math.round(coords.accuracy)}m)`);
        showLocationMap({ lat: coords.latitude, lng: coords.longitude });
      },
      (error) => {
        console.error("現在地を取れませんでした", error);
        button.disabled = false;
        showLocationText(
          error.code === error.PERMISSION_DENIED
            ? "位置の利用が許可されていません。設定で許可してから、もう一度押してください。"
            : "現在地を取れませんでした。もう一度押してください。",
        );
      },
      { enableHighAccuracy: true, timeout: LOCATION_TIMEOUT_MS, maximumAge: 0 },
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
    showError(`うまく送れませんでした。もう一度「おねがいする」を押してください。(${error.message})`);
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
