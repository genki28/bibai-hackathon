// 【お年寄り】待機画面の「来た人のスマホを聞く」(音の合言葉。鳴らす・聞くの仕組みは sound-checkin.js)。
// - 向かっている人(まだ着いていない人)がいる間だけ、ボタンを出す
// - 押すとマイクで聞き始める。若者のスマホが鳴らす合言葉が聞こえたら、サーバーに送って、その人を到着にする
// - 全員が着いたら、または 3 分たったら止める。音はどこにも送らない(送るのは聞き取った 4 桁だけ)
// - [🧪 合言葉をまねる] で、マイクを使わず画面の中で鳴らして聞く(デモ・1 台で試すため)
// 注意: 画面に文字を入れるときは必ず textContent を使う(innerHTML は使わない)。

import { byId, callApi, setIconText } from "./common.js";
import { postAction } from "./request-page.js";
import { createAudioContext, listenToSource, listenWithMicrophone, playCode } from "./sound-checkin.js";

/** 聞き続ける長さ(ミリ秒)。 */
const LISTEN_LIMIT_MS = 3 * 60_000;
/** 違っていた合言葉を、続けて送らない間隔(ミリ秒)。 */
const RESEND_GAP_MS = 3000;

/** まだ着いていない人。 */
const comingHelpers = (request) =>
  request && (request.status === "accepted" || request.status === "working")
    ? request.helpers.filter((h) => !h.arrivedAt)
    : [];

/**
 * @param {{ userId: string, onChange: (request: object) => void }} options
 *   onChange は、だれかが着いたときに、新しい依頼の様子で呼ぶ(画面をすぐ直すため)
 * @returns {{ update: (request: object | null) => void }}
 */
export function createElderSoundArrive({ userId, onChange }) {
  let request = null;
  let context = null;
  let listener = null;
  let fakePlayer = null;
  let limitTimer = 0;
  let isSending = false;
  let lastWrong = { code: "", at: 0 };

  /** 状態の文字。iconName があれば、前にアイコンを付ける。 */
  const setStatus = (text, iconName = "") => {
    if (iconName) setIconText(byId("sound-status"), iconName, text);
    else byId("sound-status").textContent = text;
  };

  function stop(message = "", iconName = "") {
    listener?.stop();
    fakePlayer?.stop();
    listener = null;
    fakePlayer = null;
    clearTimeout(limitTimer);
    byId("sound-listen").hidden = false;
    byId("sound-level").hidden = true;
    setStatus(message, iconName);
  }

  /** 着いた人の名前(前の様子と比べて、新しく着いた人)。 */
  function arrivedNames(before, after) {
    const wasComing = new Set(comingHelpers(before).map((h) => h.userId));
    return after.helpers.filter((h) => h.arrivedAt && wasComing.has(h.userId)).map((h) => `${h.displayName} さん`);
  }

  async function onCode(code) {
    const now = Date.now();
    if (!request || isSending || (code === lastWrong.code && now - lastWrong.at < RESEND_GAP_MS)) return;
    isSending = true;
    try {
      const latest = await postAction(request.id, "arrive-by-sound", { userId, code });
      const names = arrivedNames(request, latest).join("、");
      request = latest;
      onChange(latest);
      if (comingHelpers(latest).length === 0) stop(`${names}が着きました!`, "check");
      else setStatus(`${names}が着きました!ほかの人も、スマホを近づけてね`, "check");
    } catch (error) {
      lastWrong = { code, at: now };
      setStatus(`${error.message} もう少し近づけてね`);
    } finally {
      isSending = false;
    }
  }

  const onLevel = (level) => {
    byId("sound-level").classList.toggle("is-hearing", level > 0);
  };

  /** 聞き始める。makeListener は、マイクか、テスト用の画面の中の音か。 */
  async function begin(makeListener) {
    stop();
    try {
      context ??= createAudioContext();
      context.resume();
      listener = await makeListener();
      byId("sound-listen").hidden = true;
      byId("sound-level").hidden = false;
      setStatus("聞いています。来た人に、スマホを近づけてもらってね", "antenna");
      limitTimer = setTimeout(() => stop("聞くのを止めました。もう一度押すと聞き直します。"), LISTEN_LIMIT_MS);
    } catch (error) {
      console.error("合言葉を聞けませんでした", error);
      stop(`マイクを使えませんでした(${error.message})`);
    }
  }

  byId("sound-listen").addEventListener("click", () =>
    begin(() => listenWithMicrophone(context, onCode, onLevel)),
  );
  {
    const fake = byId("sound-fake");
    fake.hidden = false;
    // まだ着いていない人の合言葉を受け取り、スピーカーとマイクの代わりに画面の中でつないで鳴らす
    fake.addEventListener("click", () =>
      begin(async () => {
        const helper = comingHelpers(request)[0];
        if (!helper) throw new Error("向かっている人がいません");
        const { code } = await callApi(
          `/api/help-requests/${request.id}/arrival-code?userId=${encodeURIComponent(helper.userId)}`,
        );
        const bus = context.createGain();
        fakePlayer = playCode(context, code, { destination: bus });
        return listenToSource(context, bus, onCode, onLevel);
      }),
    );
  }

  return {
    update(next) {
      request = next;
      const isShown = comingHelpers(next).length > 0;
      byId("sound-section").hidden = !isShown;
      if (!isShown && listener) stop();
    },
  };
}
