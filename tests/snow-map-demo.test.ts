import { describe, expect, test } from "vitest";
import { createDemoMap } from "../public/snow-map/demo-data.js";

const NOW = Date.parse("2026-11-23T03:00:00Z");

describe("createDemoMap(雪山マップの見本のデータ)", () => {
  test("たくさんの雪山を作る(ふつうは 60 個)", () => {
    expect(createDemoMap({ now: NOW }).piles).toHaveLength(60);
  });

  test("同じ種なら、いつも同じ雪山", () => {
    expect(createDemoMap({ seed: 7, now: NOW })).toEqual(createDemoMap({ seed: 7, now: NOW }));
  });

  test("雪山はすべて美唄のまわり(緯度 43.28〜43.38・経度 141.81〜141.92)", () => {
    createDemoMap({ now: NOW }).piles.forEach((pile) => {
      expect(pile.lat).toBeGreaterThan(43.28);
      expect(pile.lat).toBeLessThan(43.38);
      expect(pile.lng).toBeGreaterThan(141.81);
      expect(pile.lng).toBeLessThan(141.92);
    });
  });

  test("チームは 2〜6 人で、同じ人は重ならない。合計は 1 人ずつの足し算", () => {
    createDemoMap({ now: NOW }).piles.forEach((pile) => {
      expect(pile.members.length).toBeGreaterThanOrEqual(2);
      expect(pile.members.length).toBeLessThanOrEqual(6);
      expect(new Set(pile.members.map((m) => m.displayName)).size).toBe(pile.members.length);
      expect(pile.totalCalories).toBe(pile.members.reduce((sum, m) => sum + m.calories, 0));
    });
  });

  test("雪かきをした日は、この 2 週間のうち", () => {
    createDemoMap({ now: NOW }).piles.forEach((pile) => {
      const age = NOW - Date.parse(pile.finishedAt);
      expect(age).toBeGreaterThanOrEqual(0);
      expect(age).toBeLessThanOrEqual(14 * 86_400_000);
    });
  });

  test("全体の数は、雪山の数・関わった人の数(重なりなし)・カロリーの合計", () => {
    const map = createDemoMap({ now: NOW });
    expect(map.totals.piles).toBe(60);
    expect(map.totals.calories).toBe(map.piles.reduce((sum, p) => sum + p.totalCalories, 0));
    expect(map.totals.people).toBe(new Set(map.piles.flatMap((p) => p.members.map((m) => m.displayName))).size);
    expect(map.isDemo).toBe(true);
  });
});
