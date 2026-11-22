// 【若者】ランキングの動き。デイリー / 総合を切り替えて、順位・名前・ポイントを出す。
// 上位 3 人は表彰台(金・銀・銅)、4 位から下は 1 行ずつ。いちばん上に仲間ゲージ。
// 自分の順位の下にポイントの内訳(雪かき・評価・勧誘・再会)。[友だちを誘う] は invite-share.js。
// 注意: 画面に文字を入れるときは必ず textContent を使う(innerHTML は使わない)。

import { byId, callApi, isPreviewMode } from "./common.js";
import { renderCommunityGauge } from "./community-gauge.js";
import { pageReady } from "./loading.js";
import { inviteFriends } from "./invite-share.js";
import { el, showError } from "./request-page.js";
import { resumeIfActive } from "./resume.js";
import { userIdPromise } from "./template.js";

const PERIODS = ["daily", "total"];
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
  card.setAttribute("aria-label", `${entry.rank}位 ${entry.displayName}`);
  card.append(
    el("span", String(entry.rank).padStart(2, "0"), "podium-medal"),
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
    list.replaceChildren(el("p", "雪かきが完了すると、順位が表示されます。", "note center"));
  } else {
    const podium = el("div", undefined, "podium");
    podium.append(...entries.slice(0, PODIUM_SIZE).map((entry, i) => renderPodiumCard(entry, i + 1)));
    list.replaceChildren(podium, ...entries.slice(PODIUM_SIZE).map(renderRow));
  }
  const me = entries.find((e) => e.isMe);
  const myRank = byId("my-rank");
  if (me) {
    myRank.replaceChildren(el("span", "あなた"), el("strong", `${me.rank}位`, "my-position"), el("span", formatPoints(me.points), "my-points"));
  } else {
    myRank.textContent = "あなたの順位は、初回の雪かき後に表示されます。";
  }
  renderBreakdown(me?.breakdown);
}

/** 自分のポイントの内訳。勧誘には「はじめての雪かき」ボーナスも入る。 */
function renderBreakdown(breakdown) {
  const text = byId("my-breakdown");
  text.hidden = !breakdown;
  byId("breakdown-details").hidden = !breakdown;
  if (!breakdown) return;
  const parts = [
    ["雪かき", breakdown.work],
    ["評価", breakdown.rating],
    ["勧誘", breakdown.recruit],
    ["再会", breakdown.reunion],
  ];
  text.textContent = `内訳: ${parts.map(([label, points]) => `${label} ${formatPoints(points)}`).join(" / ")}`;
}

function setUpInviteButton() {
  const button = byId("invite-button");
  const status = byId("invite-status");
  button.addEventListener("click", async () => {
    button.disabled = true;
    status.hidden = true;
    try {
      status.textContent = isPreviewMode()
        ? "(おためし表示では招待リンクを作りません)"
        : await inviteFriends(await userIdPromise);
    } catch (error) {
      console.error(error);
      status.textContent = `招待できませんでした: ${error.message}`;
    } finally {
      status.hidden = false;
      button.disabled = false;
    }
  });
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
  return show(period).catch((error) => {
    console.error(error);
    showError(`ランキングを読み込めませんでした: ${error.message}`);
  });
}

PERIODS.forEach((period) => byId(`${period}-button`).addEventListener("click", () => showSafely(period)));
setUpInviteButton();
async function main() {
  // 参加中の雪かきがあれば、ランキングを見せずにその段階の画面へ移る(?list=1 なら移らない)
  if (await resumeIfActive()) return;
  // ランキングと仲間ゲージの両方がそろってから画面を見せる
  await Promise.allSettled([showSafely("daily"), renderCommunityGauge(byId("community-gauge"))]);
  pageReady();
}

main();
