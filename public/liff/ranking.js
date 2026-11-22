// 【若者】ランキングの動き。デイリー / 総合を切り替えて、順位・名前・ポイントを出す。
// 注意: 画面に文字を入れるときは必ず textContent を使う(innerHTML は使わない)。

import { byId, callApi, isPreviewMode } from "./common.js";
import { el, showError } from "./request-page.js";
import { userIdPromise } from "./template.js";

const PERIODS = ["daily", "total"];
const MEDALS = { 1: "🥇", 2: "🥈", 3: "🥉" };

function renderEntry(entry) {
  const row = el("div", undefined, entry.isMe ? "row me" : "row");
  const medal = MEDALS[entry.rank] ?? "";
  const name = `${medal}${entry.rank} 位 ${entry.displayName}${entry.isMe ? "(あなた)" : ""}`;
  row.append(el("span", name), el("span", `${entry.points.toLocaleString("ja-JP")} pt`));
  return row;
}

function render(entries) {
  const list = byId("ranking-list");
  if (entries.length === 0) {
    list.replaceChildren(el("p", "まだだれもポイントを持っていません。一番乗りをねらおう!", "note center"));
  } else {
    list.replaceChildren(...entries.map(renderEntry));
  }
  const me = entries.find((e) => e.isMe);
  byId("my-rank").textContent = me
    ? `あなたは ${me.rank} 位(${me.points.toLocaleString("ja-JP")} pt)`
    : "雪かきをすると、ここに順位が出ます。";
}

async function show(period) {
  PERIODS.forEach((p) => byId(`${p}-button`).setAttribute("aria-pressed", String(p === period)));
  showError("");
  if (isPreviewMode()) {
    render([]);
    return;
  }
  const userId = await userIdPromise;
  const query = new URLSearchParams({ period, userId });
  render(await callApi(`/api/ranking?${query}`));
}

function showSafely(period) {
  show(period).catch((error) => {
    console.error(error);
    showError(`ランキングを読み込めませんでした: ${error.message}`);
  });
}

PERIODS.forEach((period) => byId(`${period}-button`).addEventListener("click", () => showSafely(period)));
showSafely("daily");
