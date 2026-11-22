import { describe, expect, test } from "vitest";
import {
  EMPTY_SCOOP_STATE,
  KG_PER_SCOOP,
  MIN_SCOOP_INTERVAL_MS,
  countScoops,
  scoopKg,
  scoopStateFrom,
  stepScoop,
} from "../public/liff/scoop-counter.js";
import type { ScoopSample } from "../public/liff/scoop-counter.js";

// 作った波形で確かめる。1 秒に 60 回読む(スマホの devicemotion のよくある速さ)
const SAMPLE_MS = 1000 / 60;
const GRAVITY = 9.8;

type Wave = (t: number) => { x: number; y: number; z: number };

/** durationMs のあいだ、wave の形の加速度を 1/60 秒ごとに読んだサンプルの列。 */
function sampleWave(durationMs: number, wave: Wave, includesGravity = false): ScoopSample[] {
  const count = Math.floor(durationMs / SAMPLE_MS);
  return Array.from({ length: count }, (_, i) => {
    const t = i * SAMPLE_MS;
    return { t, ...wave(t), includesGravity };
  });
}

/** 0 から widthMs の間だけ盛り上がる山(半分の sin)。それ以外は 0。 */
const pulse = (t: number, startMs: number, widthMs: number, height: number): number => {
  const local = t - startMs;
  return local >= 0 && local <= widthMs ? height * Math.sin((Math.PI * local) / widthMs) : 0;
};

/** すくう動き: 2 秒ごとに、0.4 秒の大きな揺れ(12 m/s²)が count 回。 */
const scoopWave =
  (count: number): Wave =>
  (t) => {
    const x = Array.from({ length: count }, (_, i) => pulse(t, 500 + i * 2000, 400, 12)).reduce((a, b) => a + b, 0);
    return { x, y: 0.4 * Math.sin(t / 37), z: 0.3 * Math.cos(t / 53) };
  };

describe("スコップ計の数え方", () => {
  test("すくう動きを 10 回すると 10 回と数える", () => {
    // Arrange
    const samples = sampleWave(21_000, scoopWave(10));

    // Act
    const count = countScoops(samples);

    // Assert
    expect(count).toBe(10);
  });

  test("重力込みの加速度(accelerationIncludingGravity)でも、すくう動き 10 回を 10 回と数える", () => {
    // Arrange: 縦向き(y に重力)のスマホで、すくう動きが x に出る
    const wave = scoopWave(10);
    const samples = sampleWave(21_000, (t) => ({ ...wave(t), y: wave(t).y + GRAVITY }), true);

    // Act
    const count = countScoops(samples);

    // Assert
    expect(count).toBe(10);
  });

  test("小さな揺れ(手に持って少し動かす程度)は数えない", () => {
    // Arrange
    const samples = sampleWave(10_000, (t) => ({
      x: 1.2 * Math.sin((2 * Math.PI * 8 * t) / 1000),
      y: 0.8 * Math.cos((2 * Math.PI * 5 * t) / 1000),
      z: 0.5 * Math.sin((2 * Math.PI * 3 * t) / 1000),
    }));

    // Act
    const count = countScoops(samples);

    // Assert
    expect(count).toBe(0);
  });

  test("歩く程度の揺れ(1 秒に 2 歩)は数えない", () => {
    // Arrange: 上下に 2.5 m/s²・左右に 1 m/s²、重力込み
    const samples = sampleWave(
      20_000,
      (t) => ({
        x: 1 * Math.sin((2 * Math.PI * 1 * t) / 1000),
        y: GRAVITY + 2.5 * Math.sin((2 * Math.PI * 2 * t) / 1000),
        z: 0.6 * Math.cos((2 * Math.PI * 2 * t) / 1000),
      }),
      true,
    );

    // Act
    const count = countScoops(samples);

    // Assert
    expect(count).toBe(0);
  });

  test("押して引く 1 回の動き(山が 2 つ続く)は、間隔を空けないので 1 回と数える", () => {
    // Arrange: 0.25 秒ずつ、前へ・後ろへ。2 つ目の山は最初の山の 0.3 秒後
    const samples = sampleWave(3000, (t) => ({ x: pulse(t, 500, 250, 12) - pulse(t, 800, 250, 12), y: 0, z: 0 }));

    // Act
    const count = countScoops(samples);

    // Assert
    expect(count).toBe(1);
    expect(MIN_SCOOP_INTERVAL_MS).toBeGreaterThanOrEqual(600);
    expect(MIN_SCOOP_INTERVAL_MS).toBeLessThanOrEqual(800);
  });

  test("回数を引き継いだ状態から数えると、その続きから増える", () => {
    // Arrange
    const samples = sampleWave(7000, scoopWave(3));

    // Act
    const count = countScoops(samples, scoopStateFrom(42));

    // Assert
    expect(count).toBe(45);
  });

  test("数字でないサンプル(センサーが null を返したなど)は無視し、状態を変えない", () => {
    // Arrange
    const bad = { t: 0, x: Number.NaN, y: 0, z: 0 };

    // Act
    const next = stepScoop(EMPTY_SCOOP_STATE, bad);

    // Assert
    expect(next).toBe(EMPTY_SCOOP_STATE);
  });

  test("もとの状態を書き換えない", () => {
    // Arrange
    const before = scoopStateFrom(5);
    const snapshot = JSON.stringify(before);

    // Act
    stepScoop(before, { t: 0, x: 20, y: 0, z: 0 });

    // Assert
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  test("運んだ雪の重さは 回数 × 1 杯の重さ(3.5kg)", () => {
    // Arrange / Act / Assert
    expect(KG_PER_SCOOP).toBe(3.5);
    expect(scoopKg(10)).toBe(35);
    expect(scoopKg(0)).toBe(0);
    expect(scoopKg(3)).toBe(11);
  });
});
