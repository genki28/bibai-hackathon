// 【若者】雪かき中の画面の「スコップ計」(ブラウザの部分)。数え方そのものは scoop-counter.js(純粋関数)。
// - [📱 スコップ計をオンにする] を押すと、iPhone では許可を求めて(押した処理の中で呼ぶ必要がある)、揺れを読み始める
// - 回数は端末(localStorage)に依頼 ID ごとに覚え、開き直しても続きから数える。スリープ中は数えられない
// - サーバーには 10 秒ごと・雪かきを終えるとき・画面が隠れるときに送る(POST /api/help-requests/:id/scoops)。
//   送れなくても端末の回数は残す。ポイントには入れない(表示と記録だけ)
// - テスト用の設定(testMode)がオンのときだけ [🧪 揺れをまねる] を出す(PC で試すため)
// 注意: 画面に文字を入れるときは必ず textContent を使う(innerHTML は使わない)。

import { byId } from "./common.js";
import { onPageVisible } from "./request-page.js";
import { scoopKg, scoopStateFrom, stepScoop } from "./scoop-counter.js";

/** サーバーに送る間隔(ミリ秒)。 */
const SEND_INTERVAL_MS = 10_000;
/** オンにしたのに、この時間センサーの値が 1 つも届かなければ「使えない / 許可が切れた」とみなす(ミリ秒)。 */
const NO_SIGNAL_MS = 2500;
const STORAGE_PREFIX = "scoop-meter:";
const UNAVAILABLE_TEXT = "この端末ではスコップ計が使えません";

/** 端末に覚えている { count, isOn }。読めなければ 0 回・オフ。 */
function loadSaved(requestId) {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_PREFIX + requestId) ?? "null");
    const count = Number.isInteger(saved?.count) && saved.count >= 0 ? saved.count : 0;
    return { count, isOn: saved?.isOn === true };
  } catch {
    return { count: 0, isOn: false };
  }
}

function save(requestId, count, isOn) {
  try {
    localStorage.setItem(STORAGE_PREFIX + requestId, JSON.stringify({ count, isOn }));
  } catch (error) {
    console.error("スコップ計の回数を端末に覚えておけませんでした", error);
  }
}

/** devicemotion の 1 回ぶん → 数え方に渡すサンプル。重力を除いた値がなければ重力込みの値を使う。 */
function sampleOf(event) {
  const t = event.timeStamp || performance.now();
  const pure = event.acceleration;
  if (pure && [pure.x, pure.y, pure.z].every((v) => typeof v === "number")) {
    return { t, x: pure.x, y: pure.y, z: pure.z, includesGravity: false };
  }
  const raw = event.accelerationIncludingGravity;
  if (raw && [raw.x, raw.y, raw.z].every((v) => typeof v === "number")) {
    return { t, x: raw.x, y: raw.y, z: raw.z, includesGravity: true };
  }
  return null;
}

/** 揺れを読む許可をもらう。iPhone は許可のボタン(押した処理の中でしか呼べない)、ほかはそのまま。 */
async function askPermission() {
  if (typeof window.DeviceMotionEvent === "undefined") return false;
  if (typeof DeviceMotionEvent.requestPermission !== "function") return true;
  try {
    return (await DeviceMotionEvent.requestPermission()) === "granted";
  } catch (error) {
    console.error("揺れを読む許可をもらえませんでした", error);
    return false;
  }
}

/**
 * スコップ計を動かす。
 * @param {{
 *   requestId: string,
 *   send: (count: number, options?: { keepalive?: boolean }) => Promise<unknown>,
 *   onScoop?: (count: number) => void,
 *   isTestMode?: boolean,
 * }} options send はサーバーに回数を送る処理、onScoop は 1 回すくうたびに今の回数で呼ぶ(雪を投げる・音・ボス)
 * @returns {{ flush: () => Promise<void>, count: () => number }} flush は「いまの回数をすぐ送る」(雪かきを終えるとき用)
 */
export function startScoopMeter({ requestId, send, onScoop = () => {}, isTestMode = false }) {
  const saved = loadSaved(requestId);
  let state = scoopStateFrom(saved.count);
  let isOn = saved.isOn;
  let isListening = false;
  let hasSignal = false;
  let sentCount = 0;
  let isSending = false;
  let signalTimer = 0;

  const showCount = () => {
    byId("scoop-count").textContent = state.count.toLocaleString("ja-JP");
    byId("scoop-kg").textContent = scoopKg(state.count).toLocaleString("ja-JP");
  };

  /** 表示を切り替える: "off"(ボタン)・"on"(数えている)・"unavailable"(使えない)。 */
  function showMode(mode) {
    byId("scoop-on").hidden = mode === "on";
    byId("scoop-on").textContent = mode === "unavailable" ? "📱 もう一度オンにしてみる" : "📱 スコップ計をオンにする";
    byId("scoop-unavailable").textContent = UNAVAILABLE_TEXT;
    byId("scoop-unavailable").hidden = mode !== "unavailable";
    byId("scoop-guide").hidden = mode !== "on";
    // 回数は、数えている間と、これまでに 1 回以上すくったときに出す
    byId("scoop-live").hidden = mode !== "on" && state.count === 0;
  }

  function addScoops(next) {
    const added = next.count - state.count;
    state = next;
    if (added <= 0) return;
    save(requestId, state.count, isOn);
    showCount();
    const counter = byId("scoop-count");
    counter.classList.remove("is-bump");
    void counter.offsetWidth; // アニメーションをやり直すため
    counter.classList.add("is-bump");
    onScoop(state.count);
  }

  const onMotion = (event) => {
    const sample = sampleOf(event);
    if (!sample) return;
    if (!hasSignal) {
      hasSignal = true;
      clearTimeout(signalTimer);
      showMode("on");
    }
    addScoops(stepScoop(state, sample));
  };

  function listen() {
    if (!isListening) window.addEventListener("devicemotion", onMotion);
    isListening = true;
    // 値が届かなければ、使えない(または iPhone で許可が切れた)ので、もう一度ボタンを出す
    hasSignal = false;
    clearTimeout(signalTimer);
    signalTimer = setTimeout(() => {
      if (!hasSignal) showMode("unavailable");
    }, NO_SIGNAL_MS);
  }

  async function turnOn() {
    const isAllowed = await askPermission();
    if (!isAllowed) {
      showMode("unavailable");
      return;
    }
    isOn = true;
    save(requestId, state.count, isOn);
    showMode("on");
    listen();
  }

  async function sendNow(options) {
    if (isSending || state.count <= sentCount) return;
    isSending = true;
    const count = state.count;
    try {
      await send(count, options);
      sentCount = count;
    } catch (error) {
      // 送れなくても端末の回数は残る。次の機会にまた送る
      console.error("スコップ計の回数を送れませんでした", error);
    } finally {
      isSending = false;
    }
  }

  byId("scoop-on").addEventListener("click", () => {
    turnOn();
  });
  if (isTestMode) {
    const fake = byId("scoop-fake");
    fake.hidden = false;
    fake.addEventListener("click", () => {
      byId("scoop-live").hidden = false;
      addScoops({ ...state, count: state.count + 1 });
    });
  }

  showCount();
  showMode("off");
  // 前にオンにしていたら、そのまま読み始める(iPhone で許可が切れていれば、値が届かずボタンが出る)
  if (isOn) listen();
  setInterval(() => sendNow(), SEND_INTERVAL_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) sendNow({ keepalive: true });
  });
  // スリープから戻ったら、もう一度読み始める(オンにしていた場合)
  onPageVisible(() => {
    if (isOn) listen();
  });
  sendNow();

  return { flush: () => sendNow(), count: () => state.count };
}
