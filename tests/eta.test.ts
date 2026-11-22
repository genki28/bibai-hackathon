import { describe, expect, test } from "vitest";
import {
  distanceM,
  etaMinutes,
  helperProgress,
  locationAgeText,
  minutesAgo,
  stepToward,
} from "../public/liff/eta.js";

// 美唄あたり。緯度 0.01 度 ≒ 1,112m
const HOME = { lat: 43.33, lng: 141.853 };
const NOW = new Date("2026-11-23T07:00:00Z");
const minutesBefore = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();

describe("distanceM(まっすぐの距離)", () => {
  test("緯度が 0.01 度ちがうと、およそ 1,112m", () => {
    // Arrange
    const north = { lat: HOME.lat + 0.01, lng: HOME.lng };

    // Act
    const meters = distanceM(HOME, north);

    // Assert
    expect(meters).toBeGreaterThan(1100);
    expect(meters).toBeLessThan(1125);
  });

  test("同じ点なら 0m", () => {
    // Arrange・Act
    const meters = distanceM(HOME, HOME);

    // Assert
    expect(meters).toBe(0);
  });
});

describe("etaMinutes(到着の目安)", () => {
  test("400m は歩く速さ 4.8km/h(80m/分)で 5 分", () => {
    // Arrange
    const meters = 400;

    // Act
    const minutes = etaMinutes(meters);

    // Assert
    expect(minutes).toBe(5);
  });

  test("端数は切り上げる(401m → 6 分)", () => {
    // Arrange・Act
    const minutes = etaMinutes(401);

    // Assert
    expect(minutes).toBe(6);
  });

  test("すぐ近く(0m)でも最低 1 分", () => {
    // Arrange・Act
    const minutes = etaMinutes(0);

    // Assert
    expect(minutes).toBe(1);
  });
});

describe("locationAgeText(〇分前の位置)", () => {
  test("1 分 30 秒前なら「1 分前の位置」", () => {
    // Arrange
    const at = new Date(NOW.getTime() - 90_000).toISOString();

    // Act
    const text = locationAgeText(at, NOW);

    // Assert
    expect(text).toBe("1 分前の位置");
  });

  test("1 分未満なら「たったいまの位置」", () => {
    // Arrange
    const at = new Date(NOW.getTime() - 20_000).toISOString();

    // Act
    const text = locationAgeText(at, NOW);

    // Assert
    expect(text).toBe("たったいまの位置");
  });

  test("時計のずれで先の時刻になっていても 0 分として扱う", () => {
    // Arrange
    const future = new Date(NOW.getTime() + 120_000).toISOString();

    // Act
    const minutes = minutesAgo(future, NOW);

    // Assert
    expect(minutes).toBe(0);
  });
});

describe("helperProgress(お年寄りの画面に出す 1 人の様子)", () => {
  test("到着した人は arrived(位置があっても出さない)", () => {
    // Arrange
    const helper = { arrivedAt: minutesBefore(1), location: { ...HOME, at: minutesBefore(2) } };

    // Act
    const progress = helperProgress(helper, HOME, NOW);

    // Assert
    expect(progress).toEqual({ kind: "arrived" });
  });

  test("位置がない人は no-location(位置の共有なし)", () => {
    // Arrange
    const helper = { arrivedAt: null };

    // Act
    const progress = helperProgress(helper, HOME, NOW);

    // Assert
    expect(progress).toEqual({ kind: "no-location" });
  });

  test("位置があれば、家までの距離から到着の目安と「〇分前の位置」を出す", () => {
    // Arrange: 家から北へ約 1,112m → 1112 ÷ 80 = 13.9 → 14 分
    const helper = { arrivedAt: null, location: { lat: HOME.lat + 0.01, lng: HOME.lng, at: minutesBefore(2) } };

    // Act
    const progress = helperProgress(helper, HOME, NOW);

    // Assert
    expect(progress).toEqual({ kind: "sharing", minutes: 14, ageText: "2 分前の位置" });
  });

  test("家の位置がないときは到着の目安を出さない(minutes が null)", () => {
    // Arrange
    const helper = { arrivedAt: null, location: { ...HOME, at: minutesBefore(0) } };

    // Act
    const progress = helperProgress(helper, null, NOW);

    // Assert
    expect(progress).toEqual({ kind: "sharing", minutes: null, ageText: "たったいまの位置" });
  });
});

describe("stepToward(位置をまねるときに少し近づく)", () => {
  test("150m 近づくと、残りの距離が 150m 減る", () => {
    // Arrange
    const from = { lat: HOME.lat - 0.01, lng: HOME.lng };
    const before = distanceM(from, HOME);

    // Act
    const next = stepToward(from, HOME, 150);

    // Assert
    expect(before - distanceM(next, HOME)).toBeCloseTo(150, 0);
  });

  test("残りが近づく距離より短ければ、ちょうど家に着く", () => {
    // Arrange
    const from = { lat: HOME.lat + 0.0005, lng: HOME.lng };

    // Act
    const next = stepToward(from, HOME, 150);

    // Assert
    expect(next).toEqual(HOME);
  });
});
