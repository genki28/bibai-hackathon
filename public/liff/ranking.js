// 【若者】ランキングの動き。デイリー / 総合を切り替えて、順位・名前・ポイントを出す。
// 上位 3 人は表彰台(金・銀・銅)、4 位から下は 1 行ずつ。いちばん上に仲間ゲージ。
// 注意: 画面に文字を入れるときは必ず textContent を使う(innerHTML は使わない)。

import { byId, callApi, isPreviewMode } from "./common.js";
import { renderCommunityGauge } from "./community-gauge.js";
import { el, showError } from "./request-page.js";
import { userIdPromise } from "./template.js";

const PERIODS = ["daily", "total"];
const MEDALS = { 1: "👑", 2: "🥈", 3: "🥉" };
const PODIUM_SIZE = 3;
/** 称号(ポイントがこれ以上で名乗れる。値は仮。docs/design.md の「バッジ」)。多い順に並べる。 */
const TITLES = [
  { minPoints: 30000, label: "ゆきの勇者" },
  { minPoints: 10000, label: "ふぶき" },
  { minPoints: 3000, label: "つらら" },
  { minPoints: 0, label: "ゆきだるま" },
];

const formatPoints = (points) => `${points.toLocaleString("ja-JP")} pt`;
const titleOf = (points) => TITLES.find((t) => points >= t.minPoints)?.label ?? TITLES.at(-1).label;

function nameWithMe(entry, className) {
  const name = el("span", entry.displayName, className);
  if (entry.isMe) name.append(el("span", "あなた", "me-tag"));
  return name;
}

/** 表彰台の 1 枚。place は台の位置(1 = 真ん中の高い台)。 */
function renderPodiumCard(entry, place) {
  const card = el("div", undefined, `podium-card place-${place}${entry.isMe ? " is-me" : ""}`);
  card.append(
    el("span", MEDALS[entry.rank] ?? "⭐", "podium-medal"),
    el("span", `${entry.rank} 位`, "note"),
    nameWithMe(entry, "podium-name"),
    el("p", formatPoints(entry.points), "podium-points"),
    el("span", titleOf(entry.points), "badge"),
  );
  return card;
}

function renderRow(entry) {
  const row = el("div", undefined, entry.isMe ? "rank-row is-me" : "rank-row");
  row.append(
    el("span", String(entry.rank), "rank-number"),
    nameWithMe(entry, "rank-name"),
    el("span", formatPoints(entry.points), "rank-points"),
  );
  return row;
}

function render(entries) {
  const list = byId("ranking-list");
  if (entries.length === 0) {
    list.replaceChildren(el("p", "まだだれもポイントを持っていません。一番乗りをねらおう!", "note center"));
  } else {
    const podium = el("div", undefined, "podium");
    podium.append(...entries.slice(0, PODIUM_SIZE).map((entry, i) => renderPodiumCard(entry, i + 1)));
    list.replaceChildren(podium, ...entries.slice(PODIUM_SIZE).map(renderRow));
  }
  const me = entries.find((e) => e.isMe);
  byId("my-rank").textContent = me
    ? `あなたは ${me.rank} 位 ・ ${formatPoints(me.points)} ・ 称号「${titleOf(me.points)}」`
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
renderCommunityGauge(byId("community-gauge"));
