// 【お年寄り】いいねの動き。来てくれた人ごとに星 1〜5 を選んで、送信(API)する。
// 星の見た目は template.css の .stars(選んだ星とその左が光る)を使う。
// 注意: 画面に文字を入れるときは必ず textContent を使う(innerHTML は使わない)。

import { byId } from "./common.js";
import { pageReady } from "./loading.js";
import { el, fetchRequest, postAction, requestIdFromUrl, showError } from "./request-page.js";
import { userIdPromise } from "./template.js";

const MAX_STARS = 5;
const DEFAULT_STARS = 5;

/** 星 5 つの選択肢。HTML は 5 → 1 の順に並べる(template.css が右から並べて 1 → 5 に見せる)。 */
function renderStars(groupName, label) {
  const stars = el("div", undefined, "stars");
  stars.setAttribute("role", "radiogroup");
  stars.setAttribute("aria-label", label);
  const labels = Array.from({ length: MAX_STARS }, (_, i) => MAX_STARS - i).map((value) => {
    const input = document.createElement("input");
    input.type = "radio";
    input.name = groupName;
    input.value = String(value);
    input.checked = value === DEFAULT_STARS;
    const starLabel = el("label");
    starLabel.setAttribute("aria-label", `星 ${value}`);
    starLabel.append(input, "★");
    return starLabel;
  });
  stars.append(...labels);
  return stars;
}

function renderHelper(helper, index) {
  const box = el("div", undefined, "helper-rating");
  box.append(el("p", `${helper.displayName} さん`), renderStars(`stars-${index}`, `${helper.displayName} さんの評価`));
  return box;
}

/** 選ばれた星を { 若者のユーザー ID: 星 } にまとめる。 */
function collectRatings(helpers) {
  return Object.fromEntries(
    helpers.map((h, index) => {
      const checked = document.querySelector(`input[name="stars-${index}"]:checked`);
      return [h.userId, Number(checked?.value ?? DEFAULT_STARS)];
    }),
  );
}

function showSent() {
  byId("step-form").hidden = true;
  byId("step-sent").hidden = false;
}

async function onSend(id, userId, helpers) {
  const button = byId("send-button");
  button.disabled = true;
  showError("");
  try {
    await postAction(id, "thanks", { userId, ratings: collectRatings(helpers) });
    showSent();
  } catch (error) {
    console.error(error);
    showError(`送れませんでした: ${error.message}`);
    button.disabled = false;
  }
}

async function main() {
  const id = requestIdFromUrl();
  if (!id) {
    byId("loading").textContent = "どの雪かきか分かりませんでした。待機画面から開き直してください。";
    return;
  }
  const userId = await userIdPromise;
  const request = await fetchRequest(id, userId);
  if (request.viewer !== "elder") {
    byId("loading").textContent = "おねがいした人だけが、いいねを送れます。";
    return;
  }
  if (request.thankedAt) {
    showSent();
    return;
  }
  if (request.status !== "done" || request.helpers.length === 0) {
    byId("loading").textContent = "雪かきが終わったら、ここからいいねを送れます。";
    return;
  }
  byId("loading").hidden = true;
  byId("helper-ratings").replaceChildren(...request.helpers.map(renderHelper));
  byId("send-button").hidden = false;
  byId("send-button").addEventListener("click", () => onSend(id, userId, request.helpers));
}

main()
  .catch((error) => {
    console.error(error);
    showError(`読み込めませんでした: ${error.message}`);
  })
  .finally(pageReady);
