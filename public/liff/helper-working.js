// 【若者】雪かき中の動き。開始時刻はサーバーにあるので、開き直しても経過時間は続きから出る。
// だれかが先に終えたら、自動でお疲れ様の画面へ進む。雪かきの様子はドット絵(pixel-snow.js)で描く。
// 注意: 画面に文字を入れるときは必ず textContent を使う(innerHTML は使わない)。

import { byId } from "./common.js";
import { navigateTo, pageReady } from "./loading.js";
import {
  fetchRequest,
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

const POLL_INTERVAL_MS = 5000;
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
  return getElapsedMs;
}

/** 依頼の参加者を、ドット絵に並べる形にする(参加した順。先頭がリーダー)。 */
function crewOf(request, userId) {
  const leaderId = request.leaderUserId ?? request.helpers[0]?.userId;
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
  byId("finish-button").addEventListener("click", () => {
    navigateTo(pageUrl("snow-area.html", id));
  });
  // 数秒ごとに読み直す。終わっていれば次の画面へ。途中で人が増えたら、絵にも登場させる
  startPolling(async () => {
    const latest = await fetchRequest(id, userId);
    if (moveIfNeeded(latest, id)) return true;
    showHelperNames(latest);
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
