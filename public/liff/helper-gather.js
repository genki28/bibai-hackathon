// 【若者】待機中(集合待ち)の動き。数秒ごとに依頼を読み直し、開始されたら雪かき中の画面へ進む。
// 注意: 画面に文字を入れるときは必ず textContent を使う(innerHTML は使わない)。

import { byId } from "./common.js";
import {
  el,
  fetchRequest,
  pageUrl,
  postAction,
  requestIdFromUrl,
  showError,
  showMessageOnly,
  startPolling,
  stopIfUnavailable,
} from "./request-page.js";
import { userIdPromise } from "./template.js";

const POLL_INTERVAL_MS = 3000;

function renderHelper(helper, isLeader, isMe) {
  const item = el("li");
  const row = el("div", undefined, "row");
  const name = `${isLeader ? "👑 " : ""}${helper.displayName}${isMe ? "(あなた)" : ""}`;
  row.append(el("span", name), el("span", helper.arrivedAt ? "✅ 到着" : "🚶 向かっています"));
  item.append(row);
  return item;
}

function render(request, userId) {
  const arrived = request.helpers.filter((h) => h.arrivedAt).length;
  byId("gather-count").textContent = `${arrived}/${request.helpers.length}人集合`;
  byId("helper-list").replaceChildren(
    ...request.helpers.map((h) =>
      renderHelper(h, h.userId === request.leaderUserId, h.userId === userId),
    ),
  );
  const isLeader = request.leaderUserId === userId;
  byId("start-button").hidden = !isLeader;
  byId("leader-note").textContent = isLeader
    ? "あなたがリーダーです。みんながそろったら「雪かき開始」を押してください。"
    : "リーダー(👑)が開始するのを待っています。";
}

/** 1 回分の更新。次の画面へ進むか、続けられないときは true(= 更新をやめる)。 */
async function refresh(id, userId) {
  const request = await fetchRequest(id, userId);
  if (stopIfUnavailable(request)) return true;
  if (request.status === "working" || request.status === "done") {
    location.replace(pageUrl("helper-working.html", id));
    return true;
  }
  showError("");
  render(request, userId);
  return false;
}

async function main() {
  const id = requestIdFromUrl();
  if (!id) {
    showMessageOnly("依頼が分かりません", "「助けに行く」から、行きたい依頼を選んでください。");
    return;
  }
  const userId = await userIdPromise;
  byId("start-button").addEventListener("click", async () => {
    const button = byId("start-button");
    button.disabled = true;
    try {
      await postAction(id, "start", { userId });
      location.replace(pageUrl("helper-working.html", id));
    } catch (error) {
      console.error(error);
      showError(`開始できませんでした: ${error.message}`);
      button.disabled = false;
    }
  });
  startPolling(() => refresh(id, userId), POLL_INTERVAL_MS, (error) =>
    showError(`更新できませんでした: ${error.message}`),
  );
}

main().catch((error) => {
  console.error(error);
  showError(`読み込めませんでした: ${error.message}`);
});
