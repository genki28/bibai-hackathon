// 【若者】場所・詳細の画面で、自分の現在地をお年寄りに知らせる(タクシーアプリのように)。
// - 位置の共有はいつもオン。画面を開いたらすぐ位置を読み始める(はじめは端末の「位置の利用を許可しますか」が出る)
// - 共有するなら navigator.geolocation.watchPosition で位置を読み、SEND_INTERVAL_MS ごとにサーバーへ送る
//   (POST /api/help-requests/:id/location)。ほとんど動いていないときは送らない(MIN_MOVE_M と RESEND_MS)
// - 画面が隠れたら止め、見えたら再開する。到着・参加の取り消しのときは stop() で止める
// - 位置が取れない・拒否されたら「位置を取得できませんでした」。参加はそのまま続けられる
// - [🧪 位置をまねる] で、押すたびに家へ少しずつ近づく位置を送る(デモ・屋内で試すため)
// 注意: 画面に文字を入れるときは必ず textContent を使う(innerHTML は使わない)。

import { byId, setIconText } from "./common.js";
import { distanceM, stepToward } from "./eta.js";

/** サーバーに送る間隔(ミリ秒)。 */
const SEND_INTERVAL_MS = 15_000;
/** 前に送った位置からこれ以上動いていなければ、送らない(m)。 */
const MIN_MOVE_M = 10;
/** 動いていなくても、これだけたったら送り直す(お年寄りの画面の「〇分前」が古くならないように)。 */
const RESEND_MS = 60_000;
const WATCH_OPTIONS = { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 };
/** 🧪 位置をまねる: 最初の位置(家から南西へ約 1km)と、1 回で近づく距離(m)。 */
const FAKE_START_OFFSET = { lat: -0.006, lng: -0.008 };
const FAKE_STEP_M = 150;

const STATUS = {
  sharing: "位置を共有しています(到着するまで)",
  waitingFix: "位置を読み込んでいます…",
  failed: "位置を取得できませんでした",
  unsupported: "この端末では位置を取得できません",
};

/** 状態の文字。共有中・読み込み中はピンのアイコン、まねたときは試験管のアイコンを付ける。 */
const showStatus = (text, iconName = "") => {
  const name = iconName || (text === STATUS.sharing || text === STATUS.waitingFix ? "pin" : "");
  if (name) setIconText(byId("share-status"), name, text);
  else byId("share-status").textContent = text;
};

/**
 * 現在地の共有を始める。
 * @param {{
 *   home: { lat: number, lng: number },
 *   send: (point: { lat: number, lng: number, accuracy: number | null }) => Promise<unknown>,
 * }} options home はお年寄りの家(なければ美唄の中心)、send はサーバーに位置を送る処理
 * @returns {{ stop: () => void }} stop は到着・参加の取り消しのときに呼ぶ(もう送らない)
 */
export function startLocationShare({ home, send }) {
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
    // 拒否されたら、見張りを続けても取れないので止める(画面を開き直すと、もう一度読み始める)
    if (error?.code === error?.PERMISSION_DENIED) pause();
  };

  function resume() {
    if (isStopped || document.hidden || watchId !== null) return;
    if (!navigator.geolocation) {
      showStatus(STATUS.unsupported);
      return;
    }
    if (!latest) showStatus(STATUS.waitingFix);
    watchId = navigator.geolocation.watchPosition(onFix, onFail, WATCH_OPTIONS);
    timer = setInterval(tick, SEND_INTERVAL_MS);
  }

  {
    const fake = byId("share-fake");
    fake.hidden = false;
    fake.addEventListener("click", async () => {
      fakePoint = stepToward(fakePoint, home, FAKE_STEP_M);
      await sendPoint({ ...fakePoint, accuracy: 10 });
      showStatus(`まねた位置を送りました(家まで約 ${Math.round(distanceM(fakePoint, home))} m)`, "test");
    });
  }

  const onVisibility = () => (document.hidden ? pause() : resume());
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", pause);
  window.addEventListener("pageshow", resume);

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
