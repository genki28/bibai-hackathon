// 【若者】雪かき中の動き。開始時刻はサーバーにあるので、開き直しても経過時間は続きから出る。
// 終わったら(リーダーが範囲に丸を付けたら)、自動でお疲れ様の画面へ進む。スリープなどから戻った瞬間にも読み直す(request-page.js)。雪かきの様子はドット絵(pixel-snow.js)で描く。
// [雪かきを終える] は、リーダーなら範囲の画面へ。リーダー以外は「リーダーを待つ」表示にして、数秒ごとに読み直す。
// スコップ計(scoop-meter.js)で、すくった回数を数えてサーバーに送る(ポイントには入れない)。
// みんなで動かした雪(moved-meter.js)を出し、節目は音の実況(sound-coach.js)で知らせる。
// スコップ計をオンにしたら、画面が消えないようにする(wake-lock.js)。
// 注意: 画面に文字を入れるときは必ず textContent を使う(innerHTML は使わない)。

import { byId, callApi, fetchAppConfig } from "./common.js";
import { navigateTo, pageReady } from "./loading.js";
import {
  fetchRequest,
  onPageVisible,
  pageUrl,
  requestIdFromUrl,
  showError,
  showMessageOnly,
  startPolling,
  stopIfUnavailable,
} from "./request-page.js";
import { userIdPromise } from "./template.js";
import { digLevel, formatElapsed, levelProgress } from "./pixel-game.js";
import { startPixelSnow } from "./pixel-snow.js";
import { startScoopMeter } from "./scoop-meter.js";
import { startMovedMeter } from "./moved-meter.js";
import { createSoundCoach } from "./sound-coach.js";
import { keepScreenOn } from "./wake-lock.js";

const POLL_INTERVAL_MS = 3000;
const TICK_MS = 1000;
/** 次のレベルまでの進み具合を見せるマスの数。 */
const LEVEL_BAR_CELLS = 10;

/** レベルの表示(「雪かきレベル」の小さな字 + Lv.〇)と、進み具合のマスを今の経過時間に合わせる。 */
function showLevel(elapsedMs) {
  const label = document.createElement("small");
  label.textContent = "雪かきレベル";
  byId("dig-level").replaceChildren(label, `Lv.${digLevel(elapsedMs)}`);
  const filled = Math.floor(levelProgress(elapsedMs) * LEVEL_BAR_CELLS);
  [...byId("level-bar").children].forEach((cell, i) => cell.classList.toggle("is-on", i < filled));
}

function startTimer(startedAt) {
  const startMs = new Date(startedAt).getTime();
  const getElapsedMs = () => Math.max(0, Date.now() - startMs);
  byId("level-bar").replaceChildren(...Array.from({ length: LEVEL_BAR_CELLS }, () => document.createElement("span")));
  const tick = () => {
    const elapsedMs = getElapsedMs();
    byId("elapsed").textContent = formatElapsed(elapsedMs);
    showLevel(elapsedMs);
  };
  tick();
  setInterval(tick, TICK_MS);
  // スリープなどから戻った瞬間に、経過時間をすぐ合わせ直す(隠れている間はタイマーが遅れることがある)
  onPageVisible(tick);
  return getElapsedMs;
}

/** 依頼の参加者を、ドット絵に並べる形にする(参加した順。リーダーには王冠)。 */
function crewOf(request, userId) {
  const leaderId = request.leaderUserId;
  const crew = request.helpers.map((helper) => ({
    id: helper.userId,
    name: helper.displayName,
    isMe: helper.userId === userId,
    isLeader: helper.userId === leaderId,
  }));
  // 参加者が読めなかったときも、自分 1 人は描く
  return crew.length > 0 ? crew : [{ id: userId, name: "あなた", isMe: true, isLeader: false }];
}

function showHelperNames(request) {
  byId("helper-names").textContent = `いっしょに: ${request.helpers.map((h) => h.displayName).join("、")}`;
}

const leaderNameOf = (request) =>
  request.helpers.find((h) => h.userId === request.leaderUserId)?.displayName ?? "リーダー";

/** 自分が範囲に丸を付けて終われるか(リーダー。リーダーの記録がない古い依頼はだれでも)。 */
const canFinish = (request, userId) => !request.leaderUserId || request.leaderUserId === userId;

/** 自分の役目を出す。 */
function showLeaderRole(request, userId) {
  const role = byId("leader-role");
  if (!request.leaderUserId) {
    role.textContent = "";
    return;
  }
  role.textContent =
    request.leaderUserId === userId
      ? "👑 あなたがリーダー(終わったら範囲を記録)"
      : `👑 リーダー: ${leaderNameOf(request)} さん`;
}

/** 「リーダーが範囲に丸を付けています」の表示にする(終わったら読み直しでお疲れ様へ進む)。 */
function showLeaderWait(request) {
  byId("leader-wait-text").textContent = `${leaderNameOf(request)} さんが範囲を記録中…`;
  byId("work-view").hidden = true;
  byId("leader-wait").hidden = false;
}

/** ドット絵の雪かきを動かす。画像が読み込めないなどで動かなければ、絵を隠す(経過時間とボタンは使える)。 */
async function startScene(getElapsedMs, crew) {
  try {
    return await startPixelSnow(byId("pixel-canvas"), { getElapsedMs, crew, labels: byId("crew-labels") });
  } catch (error) {
    console.error("ドット絵のアニメーションを動かせませんでした", error);
    document.querySelector(".pixel-stage")?.classList.add("is-unavailable");
    return null;
  }
}

/** スコップ計の回数をサーバーに送る。keepalive は画面が隠れる・閉じるときでも送り切るため。 */
const sendScoops = (id, userId) => (count, { keepalive = false } = {}) =>
  callApi(`/api/help-requests/${id}/scoops`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId, count }),
    keepalive,
  });

/** テスト用の設定(testMode)がオンか。読めなければオフ。 */
async function isTestMode() {
  try {
    return (await fetchAppConfig()).testMode;
  } catch {
    return false;
  }
}

/** 音の実況のボタンの文字を、今のオン / オフに合わせる。 */
function showSoundToggle(coach) {
  const button = byId("sound-toggle");
  button.textContent = coach.isOn() ? "🔊 音の実況: オン" : "🔇 音の実況: オフ";
  button.setAttribute("aria-pressed", String(coach.isOn()));
}

/**
 * 音の実況のボタンをつなぐ。音は利用者がボタンを押した処理の中でしか出し始められないので、
 * スコップ計のボタン・まねるボタン・音のボタンを押したときに、音の準備(unlock)をする。
 */
function connectSound(coach) {
  showSoundToggle(coach);
  byId("sound-toggle").addEventListener("click", () => {
    coach.unlock();
    coach.setOn(!coach.isOn());
    showSoundToggle(coach);
    if (coach.isOn()) coach.say("音の実況、オン");
  });
  byId("scoop-on").addEventListener("click", () => {
    coach.unlock();
    keepScreenOn();
    coach.say("スコップ計、スタート!");
  });
  byId("scoop-fake").addEventListener("click", () => coach.unlock(), { once: true });
}

/** 状態に合わせて画面を移る。移ったら(または続けられなければ)true。 */
function moveIfNeeded(request, id) {
  if (stopIfUnavailable(request)) return true;
  if (request.status === "done") {
    navigateTo(pageUrl("finish.html", id), { replace: true });
    return true;
  }
  if (request.status !== "working") {
    navigateTo(pageUrl("helper-gather.html", id), { replace: true });
    return true;
  }
  return false;
}

async function main() {
  const id = requestIdFromUrl();
  if (!id) {
    showMessageOnly("依頼が分かりません", "「助けに行く」から、行きたい依頼を選んでください。");
    return;
  }
  const userId = await userIdPromise;
  const request = await fetchRequest(id, userId);
  if (moveIfNeeded(request, id)) return;
  const scenePromise = startScene(startTimer(request.startedAt), crewOf(request, userId));
  showHelperNames(request);
  showLeaderRole(request, userId);
  const coach = createSoundCoach();
  connectSound(coach);
  let movedMeter = null;
  const scoopMeter = startScoopMeter({
    requestId: id,
    send: sendScoops(id, userId),
    onScoop: (count) => {
      scenePromise.then((scene) => scene?.throwOnce());
      coach.scoop();
      movedMeter?.setMyCount(count);
    },
    isTestMode: await isTestMode(),
  });
  movedMeter = startMovedMeter({ request, userId, myCount: scoopMeter.count(), coach });
  let latestRequest = request;
  byId("finish-button").addEventListener("click", async () => {
    // 終える前に、いまの回数を送っておく(送れなくても進む)
    await scoopMeter.flush();
    if (canFinish(latestRequest, userId)) {
      navigateTo(pageUrl("snow-area.html", id));
      return;
    }
    showLeaderWait(latestRequest);
  });
  // 範囲の画面から戻されたとき(?wait=1)は、最初から「リーダーを待つ」表示
  if (new URLSearchParams(location.search).has("wait") && !canFinish(request, userId)) {
    showLeaderWait(request);
  }
  // 数秒ごとに読み直す。終わっていれば次の画面へ。途中で人が増えたら、絵にも登場させる
  startPolling(async () => {
    const latest = await fetchRequest(id, userId);
    if (moveIfNeeded(latest, id)) return true;
    latestRequest = latest;
    showHelperNames(latest);
    showLeaderRole(latest, userId);
    movedMeter.setRequest(latest);
    (await scenePromise)?.setCrew(crewOf(latest, userId));
    return false;
  }, POLL_INTERVAL_MS);
}

main()
  .catch((error) => {
    console.error(error);
    showError(`読み込めませんでした: ${error.message}`);
  })
  .finally(pageReady);
