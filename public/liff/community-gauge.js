// 仲間ゲージ「美唄の仲間を 2 倍に」。GET /api/community の数を、バーとマガン(渡り鳥)の群れで見せる。
// 使い方: <section id="community-gauge" class="card"></section> を置いて renderCommunityGauge(要素) を呼ぶ。
// 注意: 画面に文字を入れるときは必ず textContent を使う(innerHTML は使わない)。

import { callApi, isPreviewMode } from "./common.js";
import { countUp } from "./effects.js";

/** 群れの鳥の数(目標に届いたら全部そろう)。 */
const FLOCK_SIZE = 10;
const GOOSE = "🪿";
/** おためし表示のときの仮の数。 */
const PREVIEW_COMMUNITY = { members: 13, goal: 20, baseline: 10 };

function el(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function renderFlock(members, goal) {
  const flown = members > 0 ? Math.max(1, Math.round((Math.min(members, goal) / goal) * FLOCK_SIZE)) : 0;
  const flock = el("p", undefined, "gauge-flock");
  flock.setAttribute("aria-hidden", "true");
  const birds = Array.from({ length: FLOCK_SIZE }, (_, i) => {
    const bird = el("span", GOOSE, i < flown ? "goose" : "goose empty");
    bird.style.setProperty("--i", String(i));
    return bird;
  });
  flock.append(...birds);
  return flock;
}

function renderGauge(container, { members, goal, baseline }) {
  const ratio = goal > 0 ? Math.min(1, members / goal) : 0;

  const count = el("strong", "0");
  const numbers = el("p", undefined, "gauge-numbers");
  numbers.append(count, ` 人 / 目標 ${goal.toLocaleString("ja-JP")} 人`, el("span", "×2", "gauge-times"));

  const head = el("div", undefined, "gauge-head");
  head.append(el("p", "美唄の仲間", "gauge-title"), numbers);

  const fill = el("div", undefined, "gauge-fill");
  const mark = el("span", undefined, "gauge-mark");
  mark.style.left = `${goal > 0 ? Math.min(100, (baseline / goal) * 100) : 0}%`;
  const bar = el("div", undefined, "gauge-bar");
  bar.setAttribute("role", "meter");
  bar.setAttribute("aria-label", "美唄の仲間の数");
  bar.setAttribute("aria-valuemin", "0");
  bar.setAttribute("aria-valuemax", String(goal));
  bar.setAttribute("aria-valuenow", String(members));
  bar.append(fill, mark);

  const note = el(
    "p",
    `シーズン開始時の ${baseline} 人を含みます。`,
    "note",
  );
  container.replaceChildren(head, bar, renderFlock(members, goal), note);

  // 表示してから伸ばす(transition を効かせるため、次のフレームで幅を変える)
  requestAnimationFrame(() => {
    fill.style.width = `${ratio * 100}%`;
  });
  countUp(count, members);
}

/** 仲間ゲージを container の中に作る。読めなかったら一言だけ出す。 */
export async function renderCommunityGauge(container) {
  if (!container) return;
  try {
    const community = isPreviewMode() ? PREVIEW_COMMUNITY : await callApi("/api/community");
    renderGauge(container, community);
  } catch (error) {
    console.error(error);
    container.replaceChildren(el("p", "仲間ゲージを読み込めませんでした。", "note center"));
  }
}
