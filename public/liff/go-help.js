// 【若者】助けに行くページの動き。
// 一覧(エリアで絞り込み・5 件ずつ)→ 場所(大まかな地図)→ 確認の小窓 → 参加 → 本人確認へ。
// 注意: 画面に文字を入れるときは必ず textContent を使う(innerHTML は使わない)。

import { byId, callApi, isPreviewMode } from "./common.js";
import { navigateTo, pageReady } from "./loading.js";
import { createMap, ROUGH_ZOOM, showRoughArea } from "./map.js";
import { el, postAction, showError } from "./request-page.js";
import { resumeIfActive } from "./resume.js";
import { profilePromise } from "./template.js";

const PAGE_SIZE = 5;
const STEPS = ["list", "place"];
const AMOUNT_LABELS = { little: "すこし", normal: "ふつう", lots: "たくさん" };
/** 雪の多さ → 難易度(雪の結晶の数)。 */
const DIFFICULTY = { little: 1, normal: 2, lots: 3 };
const NEXT_PAGE_AFTER_IDENTITY = "helper-place.html";

let requests = [];
let page = 0;
let selected = null;
let map = null;

function showStep(name) {
  STEPS.forEach((step) => {
    byId(`step-${step}`).hidden = step !== name;
  });
}

const selectedArea = () => byId("area-select").value;
const filtered = () =>
  requests.filter((r) => selectedArea() === "" || r.area === selectedArea());

/** 依頼が出てから何分たったか(「〇分前」)。 */
function timeAgo(isoString) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(isoString).getTime()) / 60_000));
  return minutes < 60 ? `${minutes}分前` : `${Math.floor(minutes / 60)}時間前`;
}

function option(label, value) {
  const element = el("option", label);
  element.value = value;
  return element;
}

/** エリアの選択肢を、いまある依頼のエリアから作る(選んでいたエリアは残す)。 */
function renderAreaOptions() {
  const select = byId("area-select");
  const previous = select.value;
  const areas = [...new Set(requests.map((r) => r.area))].sort();
  select.replaceChildren(option("すべてのエリア", ""), ...areas.map((area) => option(area, area)));
  select.value = areas.includes(previous) ? previous : "";
}

/** 参加人数の点(〇/5)。 */
function renderPartyPips(count, capacity) {
  const pips = el("span", undefined, "party-pips");
  pips.setAttribute("aria-hidden", "true");
  pips.append(...Array.from({ length: capacity }, (_, i) => el("i", undefined, i < count ? "filled" : "")));
  return pips;
}

/** 依頼 1 件を「クエスト」のカードにする(雪の多さ = 雪の結晶 1〜3 個)。 */
function renderListItem(request) {
  const button = el("button", undefined, "quest-card");
  button.type = "button";
  const amount = AMOUNT_LABELS[request.amount] ?? "-";
  const difficulty = el("span", "❄".repeat(DIFFICULTY[request.amount] ?? 1), "quest-difficulty");
  difficulty.setAttribute("aria-label", `雪の多さ ${amount}`);
  const party = el("span");
  party.append(renderPartyPips(request.helperCount, request.capacity), `参加 ${request.helperCount}/${request.capacity}人`);
  const meta = el("span", undefined, "quest-meta");
  meta.append(party, el("span", `雪 ${amount} ・ ${timeAgo(request.createdAt)}`));
  button.append(el("span", "協力クエスト", "quest-tag"), el("span", request.area, "quest-title"), difficulty, meta);
  button.addEventListener("click", () => showPlace(request));
  const item = el("li");
  item.append(button);
  return item;
}

function renderList() {
  const items = filtered();
  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  page = Math.min(page, pageCount - 1);
  const shown = items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  byId("waiting-count").textContent = `${items.length} 件の雪かきが募集中`;
  byId("request-list").replaceChildren(...shown.map(renderListItem));
  if (!shown.length) {
    const empty = el("li", undefined, "empty-state");
    empty.append(el("strong", "いま、このエリアの募集はありません"), el("p", "また雪が降ったら、あなたの出番。エリアを変えると、ほかの募集も確認できます。"));
    byId("request-list").append(empty);
  }
  byId("prev-button").disabled = page === 0;
  byId("next-button").disabled = page >= pageCount - 1;
  byId("page-info").textContent = `${page + 1} / ${pageCount} ページ`;
}

function showPlace(request) {
  selected = request;
  showError("");
  showStep("place");
  byId("place-postal").textContent = "〒072-xxxx";
  byId("place-address").textContent = `北海道美唄市(${request.area} 付近)`;
  const tools = request.tools ? ` ・ 道具: ${request.tools}` : "";
  byId("place-detail").textContent =
    `雪の多さ: ${AMOUNT_LABELS[request.amount] ?? "-"} ・ 参加 ${request.helperCount}/${request.capacity}人${tools}`;
  map?.remove();
  const center = { lat: request.approxLat, lng: request.approxLng };
  map = createMap(byId("rough-map"), center, ROUGH_ZOOM);
  if (map) showRoughArea(map, center);
}

async function onConfirm() {
  const button = byId("confirm-button");
  button.disabled = true;
  try {
    const { userId, displayName } = await profilePromise;
    await postAction(selected.id, "join", { userId, displayName });
    const next = new URLSearchParams({ next: NEXT_PAGE_AFTER_IDENTITY, id: selected.id });
    navigateTo(`./identity.html?${next}`);
  } catch (error) {
    console.error(error);
    byId("confirm-overlay").hidden = true;
    showError(`参加できませんでした: ${error.message}`);
  } finally {
    button.disabled = false;
  }
}

async function loadRequests() {
  if (isPreviewMode()) {
    requests = [];
  } else {
    requests = await callApi("/api/help-requests");
  }
  renderAreaOptions();
  renderList();
}

byId("area-select").addEventListener("change", () => {
  page = 0;
  renderList();
});
byId("prev-button").addEventListener("click", () => {
  page -= 1;
  renderList();
});
byId("next-button").addEventListener("click", () => {
  page += 1;
  renderList();
});
byId("back-button").addEventListener("click", () => {
  showStep("list");
  loadRequests().catch(console.error);
});
byId("go-button").addEventListener("click", () => {
  const amount = AMOUNT_LABELS[selected.amount] ?? "-";
  byId("confirm-summary").textContent =
    `📍 ${selected.area} ・ 雪 ${amount} ${"❄".repeat(DIFFICULTY[selected.amount] ?? 1)} ・ 参加 ${selected.helperCount}/${selected.capacity}人`;
  byId("confirm-overlay").hidden = false;
});
byId("confirm-back-button").addEventListener("click", () => {
  byId("confirm-overlay").hidden = true;
});
byId("confirm-button").addEventListener("click", onConfirm);

async function main() {
  // 参加中の雪かきがあれば、一覧を見せずにその段階の画面へ移る(?list=1 なら移らない)
  if (await resumeIfActive()) return;
  try {
    await loadRequests();
  } catch (error) {
    console.error(error);
    byId("waiting-count").textContent = "依頼を読み込めませんでした。画面を開き直してください。";
  }
  // 一覧がそろってから画面を見せる
  pageReady();
}

main();
