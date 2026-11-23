import { describe, expect, test } from "vitest";
import { GYM_FEE_PER_HOUR_YEN, savedGymFeeYen } from "../public/liff/gym-fee.js";

describe("savedGymFeeYen(浮いたジム代 = 雪かきの時間 × 一般的なジム代)", () => {
  test("1 時間(60 分)なら、1 時間ぶんのジム代", () => {
    expect(savedGymFeeYen(60)).toBe(GYM_FEE_PER_HOUR_YEN);
  });

  test("30 分なら半分", () => {
    expect(savedGymFeeYen(30)).toBe(GYM_FEE_PER_HOUR_YEN / 2);
  });

  test("10 円単位に四捨五入する(1 分 ≒ 16.7 円 → 20 円)", () => {
    expect(savedGymFeeYen(1)).toBe(20);
  });

  test("0 分・マイナス・数でないものは 0 円", () => {
    expect(savedGymFeeYen(0)).toBe(0);
    expect(savedGymFeeYen(-5)).toBe(0);
    expect(savedGymFeeYen(Number.NaN)).toBe(0);
  });
});
