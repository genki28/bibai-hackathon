// 【若者】目的地の画面の「スマホを近づけて到着」(音の合言葉。鳴らす・聞くの仕組みは sound-checkin.js)。
// - [合言葉を鳴らす] を押すと、サーバーから自分の合言葉を受け取り、高い音でくり返し鳴らす
// - お年寄りのスマホが聞き取ると、サーバーで到着になる。鳴らしている間は数秒ごとに読み直し、着いたら次の画面へ
// - 3 分たったら止める。[聞こえる音にする] は、高い音が出ない・拾えない端末のため
// - [到着しました] のボタンはこれまでどおり使える(予備)
// 注意: 画面に文字を入れるときは必ず textContent を使う(innerHTML は使わない)。

import { byId, callApi } from "./common.js";
import { fetchRequest } from "./request-page.js";
import { createAudioContext, playCode } from "./sound-checkin.js";

/** 鳴らし続ける長さ(ミリ秒)と、着いたかを読み直す間隔(ミリ秒)。 */
const PLAY_LIMIT_MS = 3 * 60_000;
const CHECK_INTERVAL_MS = 3000;

/**
 * @param {{ requestId: string, userId: string, onArrived: () => void }} options
 * @returns {{ stop: () => void }}
 */
export function startSoundCode({ requestId, userId, onArrived }) {
  let context = null;
  let player = null;
  let bandName = "high";
  let limitTimer = 0;
  let checkTimer = 0;

  function showPlaying(isPlaying) {
    byId("sound-play").hidden = isPlaying;
    byId("sound-playing").hidden = !isPlaying;
    byId("sound-band").textContent = bandName === "high" ? "聞こえる音にする" : "高い音にもどす";
  }

  function stop() {
    player?.stop();
    player = null;
    clearTimeout(limitTimer);
    clearInterval(checkTimer);
    showPlaying(false);
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
    byId("sound-error").hidden = true;
    try {
      context ??= createAudioContext();
      context.resume();
      const { code } = await callApi(
        `/api/help-requests/${requestId}/arrival-code?userId=${encodeURIComponent(userId)}`,
      );
      player?.stop();
      player = playCode(context, code, { bandName });
      clearTimeout(limitTimer);
      limitTimer = setTimeout(stop, PLAY_LIMIT_MS);
      clearInterval(checkTimer);
      checkTimer = setInterval(checkArrived, CHECK_INTERVAL_MS);
      showPlaying(true);
    } catch (error) {
      console.error("合言葉を鳴らせませんでした", error);
      byId("sound-error").textContent = `鳴らせませんでした: ${error.message}`;
      byId("sound-error").hidden = false;
      stop();
    }
  }

  byId("sound-play").addEventListener("click", play);
  byId("sound-stop").addEventListener("click", stop);
  byId("sound-band").addEventListener("click", () => {
    bandName = bandName === "high" ? "low" : "high";
    play();
  });
  return { stop };
}
