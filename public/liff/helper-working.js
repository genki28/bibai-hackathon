// 【若者】雪かき中の動き。開始時刻はサーバーにあるので、開き直しても経過時間は続きから出る。
// だれかが先に終えたら、自動でお疲れ様の画面へ進む。
// 注意: 画面に文字を入れるときは必ず textContent を使う(innerHTML は使わない)。

import { byId } from "./common.js";
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

const POLL_INTERVAL_MS = 5000;
const TICK_MS = 1000;
/** 雪だるまが育ちきるまでの分数と、大きさ(はじめ → 最大)。 */
const GROW_FULL_MINUTES = 30;
const SNOWMAN_MIN_SCALE = 0.6;
const SNOWMAN_MAX_SCALE = 1.25;
/** 雪だるまのレベルが 1 つ上がる分数(最大 Lv.5)。 */
const MINUTES_PER_LEVEL = 6;
const MAX_LEVEL = 5;

const pad = (n) => String(n).padStart(2, "0");

/** 経過時間を「時:分:秒」か「分:秒」の形にする。 */
function formatElapsed(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

/** 経過時間に合わせて雪だるまを大きくし、レベルを出す(見た目だけ)。 */
function growSnowman(ms) {
  const minutes = Math.max(0, ms / 60_000);
  const ratio = Math.min(1, minutes / GROW_FULL_MINUTES);
  const scale = SNOWMAN_MIN_SCALE + (SNOWMAN_MAX_SCALE - SNOWMAN_MIN_SCALE) * ratio;
  document.querySelector(".scene")?.style.setProperty("--grow", scale.toFixed(3));
  const level = Math.min(MAX_LEVEL, 1 + Math.floor(minutes / MINUTES_PER_LEVEL));
  byId("snowman-level").textContent = `雪だるま Lv.${level}`;
}

function startTimer(startedAt) {
  const startMs = new Date(startedAt).getTime();
  const tick = () => {
    const elapsedMs = Date.now() - startMs;
    byId("elapsed").textContent = formatElapsed(elapsedMs);
    growSnowman(elapsedMs);
  };
  tick();
  setInterval(tick, TICK_MS);
}

/** 状態に合わせて画面を移る。移ったら(または続けられなければ)true。 */
function moveIfNeeded(request, id) {
  if (stopIfUnavailable(request)) return true;
  if (request.status === "done") {
    location.replace(pageUrl("finish.html", id));
    return true;
  }
  if (request.status !== "working") {
    location.replace(pageUrl("helper-gather.html", id));
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
  startTimer(request.startedAt);
  byId("helper-names").textContent = `いっしょに: ${request.helpers.map((h) => h.displayName).join("、")}`;
  byId("finish-button").addEventListener("click", () => {
    location.href = pageUrl("snow-area.html", id);
  });
  startPolling(async () => moveIfNeeded(await fetchRequest(id, userId), id), POLL_INTERVAL_MS);
}

main().catch((error) => {
  console.error(error);
  showError(`読み込めませんでした: ${error.message}`);
});
