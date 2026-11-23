import { describe, expect, test } from "vitest";
import { METERS_PER_KCAL, STEPS, clusterPiles, mountainFeatures, ringAround } from "../public/snow-map/snow-mountain.js";

const CENTER = { lat: 43.33, lng: 141.853 };

describe("ringAround(雪山の 1 段の輪)", () => {
  test("閉じた多角形(最初と最後の点が同じ)", () => {
    const ring = ringAround(CENTER, 30, 8);
    expect(ring).toHaveLength(9);
    expect(ring[0]).toEqual(ring[8]);
  });

  test("半径 30m の輪は、真ん中から約 30m 離れている", () => {
    const [lng, lat] = ringAround(CENTER, 30, 8)[0];
    const dy = (lat - CENTER.lat) * 111_320;
    const dx = (lng - CENTER.lng) * 111_320 * Math.cos((CENTER.lat * Math.PI) / 180);
    expect(Math.hypot(dx, dy)).toBeCloseTo(30, 0);
  });
});

describe("mountainFeatures(カロリー → 段々の雪山)", () => {
  const members = [
    { displayName: "A", calories: 300 },
    { displayName: "B", calories: 100 },
  ];

  test("段の数だけ形ができ、上の段ほど小さく高い", () => {
    const features = mountainFeatures({ id: "p1", ...CENTER, members }, 1);
    expect(features).toHaveLength(STEPS);
    const heights = features.map((f) => f.properties.height);
    expect([...heights].sort((a, b) => a - b)).toEqual(heights);
    expect(features[0].properties.base).toBe(0);
  });

  test("いちばん上の高さは、みんなのカロリーの合計 × METERS_PER_KCAL", () => {
    const features = mountainFeatures({ id: "p1", ...CENTER, members }, 1);
    expect(features[STEPS - 1].properties.height).toBeCloseTo(400 * METERS_PER_KCAL);
  });

  test("育つ途中(progress 0.5)は、半分の高さ", () => {
    const top = (p: number) => mountainFeatures({ id: "p1", ...CENTER, members }, p)[STEPS - 1].properties.height;
    expect(top(0.5)).toBeCloseTo(top(1) / 2);
  });

  test("段の色は、その高さの層をつくった人で分ける(カロリーの多い A が下の 3/4)", () => {
    const owners = mountainFeatures({ id: "p1", ...CENTER, members }, 1).map((f) => f.properties.member);
    const countA = owners.filter((name) => name === "A").length;
    expect(countA).toBe(STEPS * 0.75);
    expect(owners[0]).toBe("A");
    expect(owners[STEPS - 1]).toBe("B");
  });

  test("カロリーが 0 でも、小さな雪山は出す(見えなくならないように)", () => {
    const features = mountainFeatures({ id: "p1", ...CENTER, members: [{ displayName: "A", calories: 0 }] }, 1);
    expect(features[STEPS - 1].properties.height).toBeGreaterThan(0);
  });
});

describe("clusterPiles(縮尺に合わせて、近くの雪山をまとめる)", () => {
  const pile = (id: string, lat: number, lng: number, members: Array<[string, number]>) => ({
    id,
    lat,
    lng,
    area: "東",
    finishedAt: "2026-11-23T03:00:00Z",
    members: members.map(([displayName, calories]) => ({ displayName, calories })),
    totalCalories: members.reduce((sum, [, c]) => sum + c, 0),
  });
  // 約 200m 離れた 2 つと、約 3km 離れた 1 つ
  const piles = [
    pile("a", 43.33, 141.853, [["A", 100], ["B", 50]]),
    pile("b", 43.3318, 141.853, [["A", 30], ["C", 70]]),
    pile("c", 43.357, 141.853, [["D", 40]]),
  ];

  test("寄って見ているときは、まとめない", () => {
    expect(clusterPiles(piles, 16)).toHaveLength(3);
  });

  test("引いて見ると、近い 2 つが 1 つの大きな雪山になる(同じ人のカロリーは足す)", () => {
    const clusters = clusterPiles(piles, 12);
    expect(clusters).toHaveLength(2);
    const big = clusters.find((c) => c.count === 2);
    expect(big?.totalCalories).toBe(250);
    expect(big?.members).toEqual([
      { displayName: "A", calories: 130 },
      { displayName: "C", calories: 70 },
      { displayName: "B", calories: 50 },
    ]);
  });

  test("もっと引くと、全部が 1 つの「美唄の雪山」になる", () => {
    const clusters = clusterPiles(piles, 9);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].totalCalories).toBe(290);
  });

  test("まとめた雪山の位置は、カロリーで重みを付けた真ん中", () => {
    const [big] = clusterPiles(piles.slice(0, 2), 12);
    expect(big.lat).toBeGreaterThan(43.33);
    expect(big.lat).toBeLessThan(43.3318);
  });
});
