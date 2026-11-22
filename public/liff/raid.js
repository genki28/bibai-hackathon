// 【若者】雪かき中の「雪山ボス」の表示と、音の実況のつなぎ役。決まりは boss-raid.js、音は sound-coach.js。
// - みんなのすくった回数(ほかの人はサーバーから数秒ごと、自分は端末で数えた回数)でボスの体力を減らす
// - 体力のゲージとドット絵の雪山(pixel-snow.js の setBoss)を合わせる
// - 回数が節目を超えたら、声で知らせる。ボスを倒したらファンファーレ
// 注意: 画面に文字を入れるときは必ず textContent を使う(innerHTML は使わない)。

import { byId } from "./common.js";
import { announcementFor, bossMaxHp, bossView, teamScoops } from "./boss-raid.js";

/**
 * @param {{
 *   request: { amount: string, helpers: Array<{ userId: string, scoops?: number }> },
 *   userId: string,
 *   myCount: number,
 *   coach: ReturnType<import("./sound-coach.js").createSoundCoach>,
 *   onBoss?: (view: ReturnType<typeof bossView>) => void,
 * }} options onBoss はボスの体力が変わるたびに呼ぶ(ドット絵の雪山に合わせる)
 * @returns {{ setMyCount: (count: number) => void, setRequest: (request: object) => void }}
 */
export function startRaid({ request, userId, myCount, coach, onBoss = () => {} }) {
  let latest = request;
  let mine = myCount;
  const pointNow = () => ({
    mine,
    team: teamScoops(latest.helpers, userId, mine),
    maxHp: bossMaxHp(latest.amount, latest.helpers.length),
  });
  let last = pointNow();

  function render(point) {
    const view = bossView(point.team, point.maxHp);
    byId("boss-hp").textContent = `${view.hp.toLocaleString("ja-JP")} / ${view.maxHp.toLocaleString("ja-JP")}`;
    byId("boss-bar-fill").style.width = `${Math.round(view.ratio * 100)}%`;
    byId("boss-card").classList.toggle("is-defeated", view.isDefeated);
    byId("boss-status").textContent = view.isDefeated ? "撃破! そのまま雪かきを続けよう" : "みんなのスコップで体力を削ろう";
    onBoss(view);
  }

  /** 回数が変わったら、表示を直して、節目なら声で知らせる。 */
  function refresh() {
    const next = pointNow();
    const announcement = announcementFor(last, next);
    last = next;
    render(next);
    if (!announcement) return;
    if (announcement.kind === "defeat") coach.fanfare();
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
