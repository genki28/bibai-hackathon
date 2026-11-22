// 【若者】お疲れ様の画面の動き。終わった依頼の結果から、自分のスコアと内訳を出す。
// 注意: 画面に文字を入れるときは必ず textContent を使う(innerHTML は使わない)。

import { byId, callApi } from "./common.js";
import { renderCommunityGauge } from "./community-gauge.js";
import { countUp, snowConfetti } from "./effects.js";
import { navigateTo, pageReady } from "./loading.js";
import {
  fetchRequest,
  pageUrl,
  requestIdFromUrl,
  showError,
  showMessageOnly,
  stopIfUnavailable,
} from "./request-page.js";
import { userIdPromise } from "./template.js";

/** 星 1 つあたりのポイント。src/help-requests/score.ts の POINTS_PER_STAR と同じ値。 */
const POINTS_PER_STAR = 100;

const format = (n) => n.toLocaleString("ja-JP");

/** この依頼で自分がもらったポイントの内訳(サーバーで計算)。読めなければ、依頼の結果だけから作る。 */
async function loadPoints(id, userId, request) {
  try {
    return await callApi(`/api/help-requests/${id}/points?userId=${encodeURIComponent(userId)}`);
  } catch (error) {
    console.error("ポイントの内訳を読めませんでした", error);
    const stars = request.ratings?.[userId] ?? null;
    const ratingPoints = (stars ?? 0) * POINTS_PER_STAR;
    const workPoints = request.result.workPoints;
    return {
      workPoints,
      stars,
      ratingPoints,
      reunion: { points: 0, partners: [] },
      firstFinishBonus: 0,
      total: workPoints + ratingPoints,
    };
  }
}

function renderBonuses(points) {
  const { reunion } = points;
  byId("reunion-points").textContent =
    reunion.points > 0 ? `${format(reunion.points)} pt(${reunion.partners.join("、")}さんと再会!)` : "なし";
  byId("first-finish-row").hidden = points.firstFinishBonus <= 0;
  byId("first-finish-points").textContent = `${format(points.firstFinishBonus)} pt`;
}

function render(request, points) {
  const { result } = request;
  // スコアは数えあげて、雪の紙吹雪を降らせる
  countUp(byId("score"), points.total, (n) => `${format(n)} pt`);
  snowConfetti();
  byId("minutes").textContent = `${format(result.minutes)} 分`;
  byId("calories").textContent = `${format(result.calories)} kcal`;
  byId("area").textContent = `${format(result.areaM2)} ㎡`;
  byId("snow").textContent = `${format(result.snowKg)} kg(積雪 ${Math.round(result.snowDepthM * 100)}cm)`;
  byId("work-points").textContent = `${format(points.workPoints)} pt`;
  byId("rating-points").textContent =
    points.stars !== null ? `${format(points.ratingPoints)} pt(星 ${points.stars})` : "まだ届いていません";
  renderBonuses(points);
}

async function main() {
  const id = requestIdFromUrl();
  if (!id) {
    showMessageOnly("依頼が分かりません", "「助けに行く」から、行きたい依頼を選んでください。");
    return;
  }
  const userId = await userIdPromise;
  const request = await fetchRequest(id, userId);
  if (stopIfUnavailable(request)) return;
  if (request.status !== "done" || !request.result) {
    navigateTo(pageUrl("helper-working.html", id), { replace: true });
    return;
  }
  const points = await loadPoints(id, userId, request);
  // スコアのカウントアップと紙吹雪が見えるように、出す直前に画面を見せる(仲間ゲージはあとから伸びる)
  pageReady();
  render(request, points);
  renderCommunityGauge(byId("community-gauge"));
}

main()
  .catch((error) => {
    console.error(error);
    showError(`読み込めませんでした: ${error.message}`);
  })
  .finally(pageReady);
