import { expect, test } from "vitest";
import type { HelpRequest } from "../src/help-requests/model.js";
import { buildRanking, toJstDate } from "../src/help-requests/ranking.js";
import {
  calculateCalories,
  calculateRatingPoints,
  calculateSnowKg,
  calculateWorkPoints,
  elapsedMinutes,
} from "../src/help-requests/score.js";
import { createHelpRequestStore } from "../src/help-requests/store.js";
import { currentSnowDepthCm } from "../src/weather/forecast.js";
import { createSnowDepthProvider } from "../src/help-requests/snow-depth.js";

const ELDER_ID = `U${"d".repeat(32)}`;
const HELPER_A = `U${"a".repeat(32)}`;
const HELPER_B = `U${"b".repeat(32)}`;
// 日本時間 2026-11-23 16:00
const NOW = new Date("2026-11-23T07:00:00Z");
const YESTERDAY = new Date("2026-11-22T07:00:00Z");

/** ポイントの内訳(書かなかった種類は 0)。 */
const breakdown = (parts: Partial<Record<"work" | "rating" | "recruit" | "reunion", number>>) => ({
  work: 0,
  rating: 0,
  recruit: 0,
  reunion: 0,
  ...parts,
});

test("雪の重さ = 面積 × 深さ × 100(kg)", () => {
  // Arrange & Act & Assert
  expect(calculateSnowKg(20, 0.3)).toBe(600);
  expect(calculateSnowKg(0, 0.3)).toBe(0);
});

test("消費カロリー = 5.5 × 60kg × 時間 × 1.05", () => {
  // Arrange & Act & Assert
  expect(calculateCalories(60)).toBe(347); // 346.5 を四捨五入
  expect(calculateCalories(0)).toBe(0);
});

test("雪かきのポイント = 分 × 100 + 雪の kg × 2、評価のポイント = 星 × 100", () => {
  // Arrange & Act & Assert
  expect(calculateWorkPoints(30, 600)).toBe(30 * 100 + 600 * 2);
  expect(calculateRatingPoints(5)).toBe(500);
});

test("雪かきのポイントは、作業時間 120 分・雪 2,000kg までしか数えない", () => {
  // Arrange & Act & Assert
  expect(calculateWorkPoints(120, 2000)).toBe(16000);
  // 長く放っておいても、範囲を大きく描いても、上限より増えない
  expect(calculateWorkPoints(600, 99999)).toBe(16000);
  expect(calculateWorkPoints(-5, -10)).toBe(0);
});

test("経過時間は分(小数第 1 位まで)。時刻が逆なら 0", () => {
  // Arrange
  const startedAt = "2026-11-23T07:00:00.000Z";

  // Act & Assert
  expect(elapsedMinutes(startedAt, new Date("2026-11-23T07:12:30Z"))).toBe(12.5);
  expect(elapsedMinutes(startedAt, new Date("2026-11-23T06:00:00Z"))).toBe(0);
});

test("日本時間の日付にする(UTC の 15 時は日本の翌日 0 時)", async () => {
  // Arrange & Act & Assert
  expect(toJstDate(new Date("2026-11-23T14:59:00Z"))).toBe("2026-11-23");
  expect(toJstDate(new Date("2026-11-23T15:00:00Z"))).toBe("2026-11-24");
});

/** 終わった(いいねも済んだ)依頼を 1 つ作る。 */
async function finishedRequests(): Promise<readonly HelpRequest[]> {
  // 乱数 0 → 到着した人のうち参加した順の先頭がリーダー
  const store = createHelpRequestStore(undefined, { random: () => 0 });
  const old = await store.create({ userId: ELDER_ID, amount: "normal" }, YESTERDAY);
  await store.join(old.id, { userId: HELPER_B, displayName: "あおい" }, YESTERDAY);
  await store.arrive(old.id, HELPER_B, YESTERDAY);
  await store.start(old.id, HELPER_B, YESTERDAY);
  // 30 分・雪なし → 3000 pt(昨日)
  await store.finish(old.id, { userId: HELPER_B, areaM2: 0 }, 0, new Date(YESTERDAY.getTime() + 30 * 60_000));

  const today = await store.create({ userId: ELDER_ID, amount: "lots" }, NOW);
  await store.join(today.id, { userId: HELPER_A, displayName: "ゆきお" }, NOW);
  await store.join(today.id, { userId: HELPER_B, displayName: "あおい" }, NOW);
  await store.arrive(today.id, HELPER_A, NOW);
  await store.arrive(today.id, HELPER_B, NOW);
  await store.start(today.id, HELPER_B, NOW);
  // 10 分・雪なし → 1000 pt(今日)を 2 人に
  await store.finish(today.id, { userId: HELPER_A, areaM2: 0 }, 0, new Date(NOW.getTime() + 10 * 60_000));
  // ゆきおに星 5 → +500(今日)
  await store.thank(today.id, ELDER_ID, { [HELPER_A]: 5 }, NOW);
  return store.listFinished();
}

test("total ランキングは全期間の合計ポイントの多い順で、名前と自分の印が付く", async () => {
  // Arrange
  const requests = await finishedRequests();

  // Act
  const ranking = buildRanking(requests, "total", NOW, HELPER_A);

  // Assert
  expect(ranking).toEqual([
    { rank: 1, displayName: "あおい", points: 4000, breakdown: breakdown({ work: 4000 }), isMe: false },
    { rank: 2, displayName: "ゆきお", points: 1500, breakdown: breakdown({ work: 1000, rating: 500 }), isMe: true },
  ]);
});

test("daily ランキングは日本時間の今日の分だけ数える", async () => {
  // Arrange
  const requests = await finishedRequests();

  // Act
  const ranking = buildRanking(requests, "daily", NOW);

  // Assert
  expect(ranking).toEqual([
    { rank: 1, displayName: "ゆきお", points: 1500, breakdown: breakdown({ work: 1000, rating: 500 }), isMe: false },
    { rank: 2, displayName: "あおい", points: 1000, breakdown: breakdown({ work: 1000 }), isMe: false },
  ]);
});

test("同じポイントの人は同じ順位になり、終わっていない依頼は数えない", async () => {
  // Arrange
  const store = createHelpRequestStore(undefined, { random: () => 0.99 });
  const r = await store.create({ userId: ELDER_ID, amount: "normal" }, NOW);
  await store.join(r.id, { userId: HELPER_A, displayName: "A" }, NOW);
  await store.join(r.id, { userId: HELPER_B, displayName: "B" }, NOW);
  await store.arrive(r.id, HELPER_A, NOW);
  await store.arrive(r.id, HELPER_B, NOW);
  const beforeFinish = buildRanking(await store.listFinished(), "total", NOW);
  // 乱数 0.99 → 到着した 2 人の後ろ(B)がリーダー
  await store.start(r.id, HELPER_A, NOW);
  await store.finish(r.id, { userId: HELPER_B, areaM2: 10 }, 0.3, NOW);

  // Act
  const ranking = buildRanking(await store.listFinished(), "total", NOW);

  // Assert
  expect(beforeFinish).toEqual([]);
  expect(ranking.map((e) => e.rank)).toEqual([1, 1]);
});

test("いまの時間帯の積雪(cm)を予報から取り出す。なければ null", () => {
  // Arrange
  const hours = [{ time: "2026-11-23T16:00", snowfallCm: 0, snowDepthCm: 45 }];

  // Act & Assert
  expect(currentSnowDepthCm(hours, NOW)).toBe(45);
  expect(currentSnowDepthCm(hours, YESTERDAY)).toBeNull();
});

test("積雪の深さは予報から m で取り、予報が取れなければ 0.3m を使う", async () => {
  // Arrange
  const forecast = {
    hourly: { time: ["2026-11-23T16:00"], snowfall: [0], snow_depth: [0.45] },
  };
  const ok = createSnowDepthProvider(async () => forecast, () => NOW);
  const broken = createSnowDepthProvider(async () => {
    throw new Error("つながらない");
  }, () => NOW);

  // Act & Assert
  expect(await ok()).toBe(0.45);
  expect(await broken()).toBe(0.3);
});
