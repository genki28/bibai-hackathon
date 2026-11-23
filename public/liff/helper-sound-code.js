// 【若者】目的地の画面の「スマホを近づけて到着」(音の合言葉。鳴らす・聞くの仕組みは sound-checkin.js)。
// - [到着しました] を押すと start() が呼ばれ、到着の画面に切り替わって、自分の合言葉を高い音でくり返し鳴らす
// - お年寄りのスマホが聞き取ると、サーバーで到着になる。鳴らしている間は数秒ごとに読み直し、着いたら次の画面へ
// - [スキップして到着] で、合言葉なしでも到着にできる(お年寄りのスマホが聞き取れないとき)
// - [聞こえる音にする] は、高い音が出ない・拾えない端末のため。3 分たったら鳴らすのを止める
// 注意: 画面に文字を入れるときは必ず textContent を使う(innerHTML は使わない)。

import { byId, callApi } from "./common.js";
import { fetchRequest } from "./request-page.js";
import { createAudioContext, playCode } from "./sound-checkin.js";

/** 鳴らし続ける長さ(ミリ秒)と、着いたかを読み直す間隔(ミリ秒)。 */
const PLAY_LIMIT_MS = 3 * 60_000;
const CHECK_INTERVAL_MS = 3000;

/**
 * @param {{ requestId: string, userId: string, onArrived: () => void, onSkip: () => Promise<void> }} options
 *   onArrived は合言葉で到着になったとき、onSkip は [スキップして到着] を押したとき
 * @returns {{ start: () => void, stop: () => void }} start は [到着しました] を押した処理の中で呼ぶ
 */
export function startSoundCode({ requestId, userId, onArrived, onSkip }) {
  let context = null;
  let player = null;
  let bandName = "high";
  let limitTimer = 0;
  let checkTimer = 0;

  const setStatus = (text) => {
    byId("sound-status").textContent = text;
  };

  function showError(message) {
    byId("sound-error").textContent = message;
    byId("sound-error").hidden = message === "";
  }

  function stop() {
    player?.stop();
    player = null;
    clearTimeout(limitTimer);
    clearInterval(checkTimer);
  }

  /** お年寄りのスマホが聞き取って、到着になったか。 */
  async function checkArrived() {
    try {
      const latest = await fetchRequest(requestId, userId);
      if (latest.helpers.find((h) => h.userId === userId)?.arrivedAt) {
        stop();
        onArrived();
      }
    } catch (error) {
      console.error("到着したか読み直せませんでした", error);
    }
  }

  async function play() {
    showError("");
    try {
      context ??= createAudioContext();
      context.resume();
      const { code } = await callApi(
        `/api/help-requests/${requestId}/arrival-code?userId=${encodeURIComponent(userId)}`,
      );
      player?.stop();
      player = playCode(context, code, { bandName });
      clearTimeout(limitTimer);
      limitTimer = setTimeout(() => {
        stop();
        setStatus("鳴らすのを止めました。もう一度鳴らすか、[スキップして到着] を押してください。");
      }, PLAY_LIMIT_MS);
      clearInterval(checkTimer);
      checkTimer = setInterval(checkArrived, CHECK_INTERVAL_MS);
      setStatus(bandName === "high" ? "合言葉を鳴らしています" : "合言葉を鳴らしています(聞こえる音)");
      byId("sound-band").textContent = bandName === "high" ? "聞こえる音にする" : "高い音にもどす";
    } catch (error) {
      console.error("合言葉を鳴らせませんでした", error);
      showError(`鳴らせませんでした: ${error.message}。[スキップして到着] を押してください。`);
      stop();
    }
  }

  /** 到着の画面に切り替えて、鳴らし始める。 */
  function start() {
    byId("sound-card").hidden = false;
    byId("arrive-row").hidden = true;
    byId("sound-skip").hidden = false;
    byId("sound-card").scrollIntoView({ behavior: "smooth", block: "center" });
    play();
  }

  byId("sound-band").addEventListener("click", () => {
    bandName = bandName === "high" ? "low" : "high";
    play();
  });
  byId("sound-skip").addEventListener("click", async () => {
    const button = byId("sound-skip");
    button.disabled = true;
    try {
      stop();
      await onSkip();
    } catch (error) {
      console.error(error);
      showError(`到着にできませんでした: ${error.message}`);
    } finally {
      button.disabled = false;
    }
  });
  return { start, stop };
}
