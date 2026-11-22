import { describe, expect, test } from "vitest";
import {
  GROUND_TOP,
  NOT_GROUND,
  clearanceRate,
  footprintWeights,
  isSnowColor,
  snowCoverage,
  snowMaskOf,
} from "../public/liff/snow-scan-core.js";

/** 幅 w・高さ h の画像を、(x, y) → [r, g, b] で塗って作る。 */
function makeImage(w: number, h: number, color: (x: number, y: number) => [number, number, number]) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const [r, g, b] = color(x, y);
      const i = (y * w + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return { data, width: w, height: h };
}

const SNOW: [number, number, number] = [235, 240, 250];
const ASPHALT: [number, number, number] = [70, 72, 78];

describe("isSnowColor(雪の色か)", () => {
  test("明るくて色の薄い点は雪", () => {
    expect(isSnowColor(235, 240, 250, 250)).toBe(true);
  });

  test("暗い点(アスファルト)は雪ではない", () => {
    expect(isSnowColor(70, 72, 78, 250)).toBe(false);
  });

  test("明るくても色の濃い点(赤い車)は雪ではない", () => {
    expect(isSnowColor(230, 40, 40, 250)).toBe(false);
  });

  test("写真全体が暗くても(夕方・日陰)、いちばん明るいあたりと比べて判定する", () => {
    expect(isSnowColor(150, 155, 165, 160)).toBe(true);
  });
});

describe("snowMaskOf(雪の部分の印)", () => {
  test("地面(写真の下のほう)だけを見る。空の白は数えない", () => {
    const image = makeImage(10, 10, () => SNOW);
    const mask = snowMaskOf(image);
    const topRow = Math.floor(10 * GROUND_TOP) - 1;
    expect(mask[topRow * 10]).toBe(NOT_GROUND);
    expect(mask[9 * 10]).toBe(1);
  });

  test("下半分が雪、ほかがアスファルトなら、下半分だけ印が付く", () => {
    const image = makeImage(4, 10, (_x, y) => (y >= 5 ? SNOW : ASPHALT));
    const mask = snowMaskOf(image);
    expect(mask[4 * 4]).toBe(0);
    expect(mask[5 * 4]).toBe(1);
  });
});

describe("footprintWeights(遠近の補正)", () => {
  test("遠い点(奥行きの値が小さい)ほど、地面の広さとして重く数える", () => {
    // Depth Anything の値は「近いほど大きい」
    const weights = footprintWeights(Float32Array.from([1, 0.5]));
    expect(weights[1]).toBeGreaterThan(weights[0]);
  });

  test("奥行きが同じなら、重みも同じ", () => {
    const weights = footprintWeights(Float32Array.from([0.7, 0.7, 0.7]));
    expect(weights[0]).toBeCloseTo(weights[2]);
  });

  test("いちばん遠い点でも、重みは上限で止まる", () => {
    const weights = footprintWeights(Float32Array.from([1, 0]));
    expect(Number.isFinite(weights[1])).toBe(true);
  });
});

describe("snowCoverage(地面のうち雪の割合)", () => {
  test("重みがなければ、地面の点の数の割合", () => {
    const image = makeImage(2, 10, (x) => (x === 0 ? SNOW : ASPHALT));
    expect(snowCoverage(snowMaskOf(image))).toBeCloseTo(0.5);
  });

  test("重みがあれば、重い点ほど割合に効く", () => {
    const image = makeImage(2, 10, (x) => (x === 0 ? SNOW : ASPHALT));
    const weights = new Float32Array(20).map((_, i) => (i % 2 === 0 ? 3 : 1));
    expect(snowCoverage(snowMaskOf(image), weights)).toBeCloseTo(0.75);
  });

  test("地面に点がなければ 0", () => {
    expect(snowCoverage(new Uint8Array(0))).toBe(0);
  });
});

describe("clearanceRate(除雪率)", () => {
  test("前の雪のうち、なくなった割合", () => {
    expect(clearanceRate(0.8, 0.2)).toBeCloseTo(0.75);
  });

  test("後のほうが雪が多ければ 0(マイナスにしない)", () => {
    expect(clearanceRate(0.3, 0.5)).toBe(0);
  });

  test("前に雪がなければ 0", () => {
    expect(clearanceRate(0, 0)).toBe(0);
  });
});

describe("footprintWeights(地面だけで奥行きをそろえる)", () => {
  test("地面の外(空)のとても遠い点に、地面の重みが引っぱられない", () => {
    // 0 番目は空(地面の外)。地面は 0.5〜1.0
    const depth = Float32Array.from([0, 0.5, 0.75, 1]);
    const mask = Uint8Array.from([NOT_GROUND, 1, 1, 1]);
    const weights = footprintWeights(depth, mask);
    // 地面のいちばん遠い点(0.5)は上限(16 倍)、いちばん近い点(1.0)は 1 倍
    expect(weights[1]).toBeCloseTo(16);
    expect(weights[3]).toBeCloseTo(1);
  });
});
