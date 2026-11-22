// 【若者】雪かき中の「みんなで動かした雪」の表示と、音の実況のつなぎ役。決まりは snow-moved.js、音は sound-coach.js。
// - みんなのすくった回数(ほかの人はサーバーから数秒ごと、自分は端末で数えた回数)× 1 杯の重さを出す
// - 節目を超えたら声で知らせる。たとえの重さ(お米 10 袋ぶん など)を超えたらファンファーレも
// 注意: 画面に文字を入れるときは必ず textContent を使う(innerHTML は使わない)。

import { byId } from "./common.js";
import { scoopKg } from "./scoop-counter.js";
import { announcementFor, comparisonFor, teamScoops } from "./snow-moved.js";

const format = (value) => value.toLocaleString("ja-JP");

/**
 * @param {{
 *   request: { helpers: Array<{ userId: string, scoops?: number }> },
 *   userId: string,
 *   myCount: number,
 *   coach: ReturnType<import("./sound-coach.js").createSoundCoach>,
 * }} options
 * @returns {{ setMyCount: (count: number) => void, setRequest: (request: object) => void }}
 */
export function startMovedMeter({ request, userId, myCount, coach }) {
  let latest = request;
  let mine = myCount;
  const pointNow = () => ({ mine, team: teamScoops(latest.helpers, userId, mine) });
  let last = pointNow();

  function render(point) {
    const kg = scoopKg(point.team);
    byId("moved-kg").textContent = format(kg);
    byId("moved-scoops").textContent = format(point.team);
    const comparison = comparisonFor(kg);
    byId("moved-comparison").textContent = comparison ? `${comparison.label}を超えた!` : "";
  }

  /** 回数が変わったら、表示を直して、節目なら声で知らせる。 */
  function refresh() {
    const next = pointNow();
    const announcement = announcementFor(last, next);
    last = next;
    render(next);
    if (!announcement) return;
    if (announcement.kind === "milestone") coach.fanfare();
    coach.say(announcement.text);
  }

  render(last);
  return {
    setMyCount(count) {
      mine = count;
      refresh();
    },
    setRequest(next) {
      latest = next;
      refresh();
    },
  };
}
