// 【若者】お疲れ様の画面の動き。終わった依頼の結果から、自分のスコアと内訳を出す。
// 注意: 画面に文字を入れるときは必ず textContent を使う(innerHTML は使わない)。

import { byId } from "./common.js";
import { renderCommunityGauge } from "./community-gauge.js";
import { countUp, snowConfetti } from "./effects.js";
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

function render(request, userId) {
  const { result } = request;
  const stars = request.ratings?.[userId] ?? 0;
  const ratingPoints = stars * POINTS_PER_STAR;
  // スコアは数えあげて、雪の紙吹雪を降らせる
  countUp(byId("score"), result.workPoints + ratingPoints, (n) => `${format(n)} pt`);
  snowConfetti();
  byId("minutes").textContent = `${format(result.minutes)} 分`;
  byId("calories").textContent = `${format(result.calories)} kcal`;
  byId("area").textContent = `${format(result.areaM2)} ㎡`;
  byId("snow").textContent = `${format(result.snowKg)} kg(積雪 ${Math.round(result.snowDepthM * 100)}cm)`;
  byId("work-points").textContent = `${format(result.workPoints)} pt`;
  byId("rating-points").textContent = request.thankedAt
    ? `${format(ratingPoints)} pt(星 ${stars})`
    : "まだ届いていません";
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
    location.replace(pageUrl("helper-working.html", id));
    return;
  }
  render(request, userId);
  renderCommunityGauge(byId("community-gauge"));
}

main().catch((error) => {
  console.error(error);
  showError(`読み込めませんでした: ${error.message}`);
});
