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

/** 参加者 1 人のアイコン(円の index 番目に置く)。到着した人は光る。 */
function renderHelper(helper, { isLeader, isMe, index, total }) {
  const item = el("li", undefined, "party-member");
  item.classList.toggle("arrived", Boolean(helper.arrivedAt));
  item.classList.toggle("is-me", isMe);
  item.style.setProperty("--i", String(index));
  item.style.setProperty("--n", String(Math.max(total, 1)));
  const avatar = el("span", Array.from(helper.displayName)[0] ?? "?", "avatar");
  avatar.setAttribute("aria-hidden", "true");
  if (isLeader) avatar.append(el("span", "👑", "crown"));
  const name = `${isLeader ? "リーダー " : ""}${helper.displayName}${isMe ? "(あなた)" : ""}`;
  item.append(
    avatar,
    el("span", name, "member-name"),
    el("span", helper.arrivedAt ? "✅ 到着" : "🚶 向かっています", "member-status"),
  );
  return item;
}

function render(request, userId) {
  const arrived = request.helpers.filter((h) => h.arrivedAt).length;
  const total = request.helpers.length;
  byId("gather-count").textContent = `${arrived}/${total}`;
  const list = byId("helper-list");
  list.classList.toggle("is-complete", total > 0 && arrived === total);
  list.replaceChildren(
    ...request.helpers.map((h, index) =>
      renderHelper(h, { isLeader: h.userId === request.leaderUserId, isMe: h.userId === userId, index, total }),
    ),
  );
  const isLeader = request.leaderUserId === userId;
  byId("start-button").hidden = !isLeader;
  byId("leader-note").textContent = isLeader
    ? "あなたがリーダー(👑)です。みんながそろったら「雪かき開始」を押してください。"
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
