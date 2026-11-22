// 【若者】場所・詳細の画面で、自分の現在地をお年寄りに知らせる(タクシーアプリのように)。
// - 送る前に「お年寄りにあなたの位置が見えます(到着するまで)」と知らせて、共有するかを選んでもらう。
//   選んだ結果は端末(localStorage)に覚えて、次から聞き直さない(切り替えのボタンはいつも出す)
// - 共有するなら navigator.geolocation.watchPosition で位置を読み、SEND_INTERVAL_MS ごとにサーバーへ送る
//   (POST /api/help-requests/:id/location)。ほとんど動いていないときは送らない(MIN_MOVE_M と RESEND_MS)
// - 画面が隠れたら止め、見えたら再開する。到着・参加の取り消しのときは stop() で止める
// - 位置が取れない・拒否されたら「位置を取得できませんでした」。参加はそのまま続けられる
// - テスト用の設定(testMode)がオンのときだけ [🧪 位置をまねる](押すたびに家へ少しずつ近づく位置を送る)
// 注意: 画面に文字を入れるときは必ず textContent を使う(innerHTML は使わない)。

import { byId } from "./common.js";
import { distanceM, stepToward } from "./eta.js";

/** サーバーに送る間隔(ミリ秒)。 */
const SEND_INTERVAL_MS = 15_000;
/** 前に送った位置からこれ以上動いていなければ、送らない(m)。 */
const MIN_MOVE_M = 10;
/** 動いていなくても、これだけたったら送り直す(お年寄りの画面の「〇分前」が古くならないように)。 */
const RESEND_MS = 60_000;
const WATCH_OPTIONS = { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 };
const CHOICE_KEY = "bibai-location-share";
const CHOICE = Object.freeze({ on: "on", off: "off" });
/** 🧪 位置をまねる: 最初の位置(家から南西へ約 1km)と、1 回で近づく距離(m)。 */
const FAKE_START_OFFSET = { lat: -0.006, lng: -0.008 };
const FAKE_STEP_M = 150;

const STATUS = {
  sharing: "📍 位置を共有しています(到着するまで)",
  waitingFix: "📍 位置を読み込んでいます…",
  off: "位置は共有していません",
  failed: "位置を取得できませんでした",
  unsupported: "この端末では位置を取得できません",
};

function loadChoice() {
  try {
    const saved = localStorage.getItem(CHOICE_KEY);
    return saved === CHOICE.on || saved === CHOICE.off ? saved : null;
  } catch {
    return null;
  }
}

function saveChoice(choice) {
  try {
    localStorage.setItem(CHOICE_KEY, choice);
  } catch (error) {
    console.error("位置の共有の設定を端末に覚えておけませんでした", error);
  }
}

const showStatus = (text) => {
  byId("share-status").textContent = text;
};

/**
 * 現在地の共有を始める。
 * @param {{
 *   home: { lat: number, lng: number },
 *   send: (point: { lat: number, lng: number, accuracy: number | null }) => Promise<unknown>,
 *   isTestMode?: boolean,
 * }} options home はお年寄りの家(なければ美唄の中心)、send はサーバーに位置を送る処理
 * @returns {{ stop: () => void }} stop は到着・参加の取り消しのときに呼ぶ(もう送らない)
 */
export function startLocationShare({ home, send, isTestMode = false }) {
  let choice = loadChoice();
  let isStopped = false;
  let watchId = null;
  let timer = 0;
  let latest = null;
  let lastSent = null;
  let isSending = false;
  let fakePoint = { lat: home.lat + FAKE_START_OFFSET.lat, lng: home.lng + FAKE_START_OFFSET.lng };

  const shouldSend = (point, now) =>
    !lastSent || distanceM(point, lastSent.point) >= MIN_MOVE_M || now - lastSent.time >= RESEND_MS;

  async function sendPoint(point) {
    if (isSending) return;
    isSending = true;
    try {
      await send(point);
      lastSent = { point, time: Date.now() };
    } catch (error) {
      // 送れなくても参加は続けられる。次の間隔でまた送る
      console.error("位置を送れませんでした", error);
    } finally {
      isSending = false;
    }
  }

  const tick = () => {
    if (latest && shouldSend(latest, Date.now())) sendPoint(latest);
  };

  function pause() {
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    watchId = null;
    clearInterval(timer);
    timer = 0;
  }

  const onFix = (position) => {
    const { latitude, longitude, accuracy } = position.coords;
    latest = { lat: latitude, lng: longitude, accuracy: Number.isFinite(accuracy) ? accuracy : null };
    showStatus(STATUS.sharing);
    if (!lastSent) sendPoint(latest);
  };

  const onFail = (error) => {
    console.error("位置を取得できませんでした", error);
    showStatus(STATUS.failed);
    // 拒否されたら、見張りを続けても取れないので止める(切り替えのボタンでやり直せる)
    if (error?.code === error?.PERMISSION_DENIED) pause();
  };

  function resume() {
    if (isStopped || choice !== CHOICE.on || document.hidden || watchId !== null) return;
    if (!navigator.geolocation) {
      showStatus(STATUS.unsupported);
      return;
    }
    if (!latest) showStatus(STATUS.waitingFix);
    watchId = navigator.geolocation.watchPosition(onFix, onFail, WATCH_OPTIONS);
    timer = setInterval(tick, SEND_INTERVAL_MS);
  }

  function showChoice() {
    byId("share-ask").hidden = choice !== null;
    const toggle = byId("share-toggle");
    toggle.hidden = choice === null;
    toggle.textContent = choice === CHOICE.on ? "位置の共有をやめる" : "📍 位置を共有する";
    if (choice === CHOICE.off) showStatus(STATUS.off);
    if (choice === null) showStatus("");
  }

  function choose(next) {
    choice = next;
    saveChoice(next);
    showChoice();
    if (next === CHOICE.on) {
      resume();
    } else {
      pause();
      latest = null;
    }
  }

  byId("share-yes").addEventListener("click", () => choose(CHOICE.on));
  byId("share-no").addEventListener("click", () => choose(CHOICE.off));
  byId("share-toggle").addEventListener("click", () =>
    choose(choice === CHOICE.on ? CHOICE.off : CHOICE.on),
  );
  if (isTestMode) {
    const fake = byId("share-fake");
    fake.hidden = false;
    fake.addEventListener("click", async () => {
      fakePoint = stepToward(fakePoint, home, FAKE_STEP_M);
      await sendPoint({ ...fakePoint, accuracy: 10 });
      showStatus(`🧪 まねた位置を送りました(家まで約 ${Math.round(distanceM(fakePoint, home))} m)`);
    });
  }

  const onVisibility = () => (document.hidden ? pause() : resume());
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", pause);
  window.addEventListener("pageshow", resume);

  showChoice();
  resume();

  return {
    stop: () => {
      isStopped = true;
      pause();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", pause);
      window.removeEventListener("pageshow", resume);
    },
  };
}
