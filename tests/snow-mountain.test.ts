import { describe, expect, test } from "vitest";
import {
  METERS_PER_KCAL,
  clusterPiles,
  growProgress,
  mountainProfile,
  mountainSize,
  pickMountain,
  seedFromId,
  snowNoise,
  toLocalMeters,
} from "../public/snow-map/snow-mountain.js";

const CENTER = { lat: 43.33, lng: 141.853 };

describe("mountainSize(カロリー → 雪山の高さと広がり)", () => {
  const members = [
    { displayName: "A", calories: 300 },
    { displayName: "B", calories: 100 },
  ];

  test("高さは、みんなのカロリーの合計 × METERS_PER_KCAL", () => {
    expect(mountainSize({ members }).heightM).toBeCloseTo(400 * METERS_PER_KCAL);
  });

  test("カロリーが多いほど、高く広い", () => {
    const small = mountainSize({ members: [{ calories: 100 }] });
    const big = mountainSize({ members: [{ calories: 900 }] });
    expect(big.heightM).toBeGreaterThan(small.heightM);
    expect(big.radiusM).toBeGreaterThan(small.radiusM);
  });

  test("引いて見たときの倍率(scale)で、高さも広がりも同じ倍になる", () => {
    const one = mountainSize({ members }, 1);
    const four = mountainSize({ members }, 4);
    expect(four.heightM).toBeCloseTo(one.heightM * 4);
    expect(four.radiusM).toBeCloseTo(one.radiusM * 4);
  });

  test("カロリーが 0 でも、小さな雪山は出す(見えなくならないように)", () => {
    expect(mountainSize({ members: [{ calories: 0 }] }).heightM).toBeGreaterThan(0);
  });
});

describe("雪山の形(でこぼこ・横から見た形)", () => {
  test("同じ ID なら同じ種、違う ID なら違う種", () => {
    expect(seedFromId("demo-1")).toBe(seedFromId("demo-1"));
    expect(seedFromId("demo-1")).not.toBe(seedFromId("demo-2"));
  });

  test("でこぼこは -1〜1 で、種が違うと形も違う", () => {
    const angles = Array.from({ length: 24 }, (_, i) => (i / 24) * Math.PI * 2);
    const a = angles.map((angle) => snowNoise(1, angle, 0.5));
    const b = angles.map((angle) => snowNoise(2, angle, 0.5));
    [...a, ...b].forEach((n) => {
      expect(n).toBeGreaterThanOrEqual(-1);
      expect(n).toBeLessThanOrEqual(1);
    });
    expect(a).not.toEqual(b);
  });

  test("横から見た形は、真ん中がいちばん高く、すそで 0 になる", () => {
    expect(mountainProfile(0)).toBe(1);
    expect(mountainProfile(1)).toBe(0);
    expect(mountainProfile(0.3)).toBeGreaterThan(mountainProfile(0.6));
  });
});

describe("growProgress(下から育つ割合)", () => {
  test("はじめは 0、時間がたつと 1。途中は半分より先に進む", () => {
    expect(growProgress(0, 0, 1000, 100)).toBe(0);
    expect(growProgress(1000, 0, 1000, 100)).toBe(1);
    expect(growProgress(500, 0, 1000, 100)).toBeGreaterThan(0.5);
  });

  test("後ろの雪山ほど遅れて育つ", () => {
    expect(growProgress(500, 3, 1000, 100)).toBeLessThan(growProgress(500, 0, 1000, 100));
  });
});

describe("toLocalMeters(基準の点からの位置)", () => {
  test("北へ 0.001 度は、約 111m 北", () => {
    const p = toLocalMeters(CENTER, { lat: CENTER.lat + 0.001, lng: CENTER.lng });
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(111.32, 1);
  });
});

describe("pickMountain(押した点に近い雪山を選ぶ)", () => {
  const candidates = [
    { item: "a", base: { x: 100, y: 300 }, peak: { x: 100, y: 200 }, radiusPx: 30 },
    { item: "b", base: { x: 300, y: 300 }, peak: { x: 300, y: 250 }, radiusPx: 30 },
  ];

  test("てっぺんのあたりを押しても、その雪山が選ばれる", () => {
    expect(pickMountain({ x: 105, y: 210 }, candidates)).toBe("a");
  });

  test("どの雪山からも遠いときは null", () => {
    expect(pickMountain({ x: 200, y: 50 }, candidates)).toBeNull();
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
