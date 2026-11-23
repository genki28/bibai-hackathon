/**
 * 「美唄の雪山の地図」とチームのカロリー(純粋な関数)。
 * - 終わった雪かき 1 件 = 地図の雪山 1 つ。一緒にやった全員の消費カロリーを、雪山の層として並べる
 * - カロリーは、若者向けアプリが加速度から測った値(helpers[].calories)を使う。測っていない人(LIFF だけの人)は、
 *   時間から出した値(result.calories)を使う
 * - 誰でも見られる地図なので、家の正確な位置・住所・お年寄りの名前・ユーザー ID は出さない(位置は約 100m に丸める)
 */
import type { Helper, HelpRequest } from "./model.js";

/** 地図に出す位置の小数の桁数(3 桁 ≒ 100m)。 */
const PUBLIC_DIGITS = 3;
const DEFAULT_AREA = "美唄市内";
const MAX_AREA_LABEL_LENGTH = 8;

export type SnowPile = {
  readonly id: string;
  readonly lat: number;
  readonly lng: number;
  readonly area: string;
  readonly finishedAt: string;
  readonly members: ReadonlyArray<{ readonly displayName: string; readonly calories: number }>;
  readonly totalCalories: number;
};

export type SnowMap = {
  readonly piles: readonly SnowPile[];
  readonly totals: { readonly piles: number; readonly people: number; readonly calories: number };
};

export type MyTeams = {
  readonly totalCalories: number;
  readonly teamCount: number;
  readonly partners: number;
  readonly teams: ReadonlyArray<{
    readonly id: string;
    readonly finishedAt: string;
    readonly area: string;
    readonly members: readonly string[];
    readonly teamCalories: number;
    readonly myCalories: number;
  }>;
};

const roundTo = (value: number, digits: number): number => {
  const base = 10 ** digits;
  return Math.round(value * base) / base;
};

/** 住所から大まかな地区(番地より前)。分からなければ「美唄市内」。views.ts の roughArea と同じ考え方。 */
function areaOf(address: string | null): string {
  if (!address) return DEFAULT_AREA;
  const rest = address.replace(/^北海道/, "").replace(/^美唄市/, "").trim();
  const head = rest.split(/[0-9０-９一二三四五六七八九十丁番-]/)[0]?.trim() ?? "";
  return head === "" ? DEFAULT_AREA : head.slice(0, MAX_AREA_LABEL_LENGTH);
}

/** その人の消費カロリー(kcal)。アプリで測った値があればそれ、なければ時間から出した値。 */
export function caloriesOf(request: HelpRequest, helper: Helper): number {
  if (typeof helper.calories === "number") return helper.calories;
  return request.result?.calories ?? 0;
}

const membersOf = (request: HelpRequest) =>
  request.helpers.map((helper) => ({ displayName: helper.displayName, calories: caloriesOf(request, helper) }));

const sumCalories = (members: ReadonlyArray<{ readonly calories: number }>) =>
  members.reduce((sum, member) => sum + member.calories, 0);

/** 美唄の雪山の地図(誰でも見られる)。 */
export function buildSnowMap(finished: readonly HelpRequest[]): SnowMap {
  const done = finished.filter((r) => r.status === "done");
  const piles = done
    .filter((r) => typeof r.lat === "number" && typeof r.lng === "number")
    .map((r) => {
      const members = membersOf(r);
      return {
        id: r.id,
        lat: roundTo(r.lat as number, PUBLIC_DIGITS),
        lng: roundTo(r.lng as number, PUBLIC_DIGITS),
        area: areaOf(r.address),
        finishedAt: r.finishedAt ?? r.createdAt,
        members,
        totalCalories: sumCalories(members),
      };
    });
  const people = new Set(done.flatMap((r) => r.helpers.map((h) => h.userId))).size;
  const calories = done.reduce((sum, r) => sum + sumCalories(membersOf(r)), 0);
  return { piles, totals: { piles: piles.length, people, calories } };
}

/** 自分が入ったチーム(終わった雪かき)と、そのカロリーの合計。新しい順。 */
export function teamsOf(finished: readonly HelpRequest[], userId: string): MyTeams {
  const mine = finished
    .filter((r) => r.status === "done" && r.helpers.some((h) => h.userId === userId))
    .sort((a, b) => (b.finishedAt ?? "").localeCompare(a.finishedAt ?? ""));
  const teams = mine.map((r) => {
    const members = membersOf(r);
    const me = r.helpers.find((h) => h.userId === userId);
    return {
      id: r.id,
      finishedAt: r.finishedAt ?? r.createdAt,
      area: areaOf(r.address),
      members: members.map((m) => m.displayName),
      teamCalories: sumCalories(members),
      myCalories: me ? caloriesOf(r, me) : 0,
    };
  });
  const partners = new Set(mine.flatMap((r) => r.helpers.map((h) => h.userId)).filter((id) => id !== userId)).size;
  return {
    totalCalories: teams.reduce((sum, t) => sum + t.teamCalories, 0),
    teamCount: teams.length,
    partners,
    teams,
  };
}
