import { describe, expect, test } from "vitest";
import { CELL_M, paintedAreaM2, toLocalMeters } from "../public/liff/brush-area-core.js";

const ORIGIN = { lat: 43.33, lng: 141.853 };

describe("toLocalMeters(緯度経度 → 家からの m)", () => {
  test("同じ点は 0", () => {
    expect(toLocalMeters(ORIGIN, ORIGIN)).toEqual({ x: 0, y: 0 });
  });

  test("北へ 0.001 度は、約 111m 上", () => {
    const p = toLocalMeters({ lat: ORIGIN.lat + 0.001, lng: ORIGIN.lng }, ORIGIN);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeGreaterThan(110);
    expect(p.y).toBeLessThan(112);
  });

  test("東へ進むと x が増える(北海道では経度 0.001 度 ≒ 81m)", () => {
    const p = toLocalMeters({ lat: ORIGIN.lat, lng: ORIGIN.lng + 0.001 }, ORIGIN);
    expect(p.x).toBeGreaterThan(80);
    expect(p.x).toBeLessThan(82);
  });
});

describe("paintedAreaM2(筆で塗った面積)", () => {
  test("何も塗っていなければ 0", () => {
    expect(paintedAreaM2([])).toBe(0);
  });

  test("太さ 2m・長さ 10m のまっすぐな線は、約 2×10 + 両端の丸(約 3.1)㎡", () => {
    const stroke = { widthM: 2, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] };
    const area = paintedAreaM2([stroke]);
    expect(area).toBeGreaterThan(21);
    expect(area).toBeLessThan(25);
  });

  test("同じところを 2 回塗っても、面積は増えない", () => {
    const stroke = { widthM: 2, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] };
    expect(paintedAreaM2([stroke, stroke])).toBeCloseTo(paintedAreaM2([stroke]));
  });

  test("離れた 2 本の線は、足し算になる", () => {
    const a = { widthM: 2, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] };
    const b = { widthM: 2, points: [{ x: 0, y: 20 }, { x: 10, y: 20 }] };
    expect(paintedAreaM2([a, b])).toBeCloseTo(paintedAreaM2([a]) * 2, 0);
  });

  test("1 点だけ押したときも、筆の丸の広さになる", () => {
    const dot = { widthM: 4, points: [{ x: 0, y: 0 }] };
    // 半径 2m の円 ≒ 12.6㎡
    expect(paintedAreaM2([dot])).toBeGreaterThan(11);
    expect(paintedAreaM2([dot])).toBeLessThan(14);
  });

  test("マス目の細かさは 50cm", () => {
    expect(CELL_M).toBe(0.5);
  });
});
