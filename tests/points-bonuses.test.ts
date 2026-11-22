import { expect, test } from "vitest";
import { firstFinishOf, recruitAwards, reunionPartners } from "../src/help-requests/bonuses.js";
import type { HelpRequest } from "../src/help-requests/model.js";
import { buildRanking } from "../src/help-requests/ranking.js";
import { pointsForRequest } from "../src/help-requests/request-points.js";
import type { Referral } from "../src/invites/model.js";

// テスト用の架空のユーザー ID
const ELDER_ID = `U${"d".repeat(32)}`;
const HELPER_A = `U${"a".repeat(32)}`;
const HELPER_B = `U${"b".repeat(32)}`;
const HELPER_C = `U${"c".repeat(32)}`;
const NAMES: Readonly<Record<string, string>> = { [HELPER_A]: "ゆきお", [HELPER_B]: "あおい", [HELPER_C]: "こはる" };
// 日本時間 2026-11-23 16:00
const NOW = new Date("2026-11-23T07:00:00Z");
const YESTERDAY_AT = "2026-11-22T07:30:00.000Z";
const TODAY_AT = "2026-11-23T06:30:00.000Z";
const TODAY_LATER_AT = "2026-11-23T06:50:00.000Z";

/** 終わった依頼を 1 件作る(雪かきのポイントは 1,000 pt)。 */
function doneRequest(n: number, helperIds: readonly string[], finishedAt: string): HelpRequest {
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    userId: ELDER_ID,
    amount: "normal",
    name: null,
    address: null,
    lat: null,
    lng: null,
    depth: null,
    tools: null,
    status: "done",
    createdAt: finishedAt,
    helpers: helperIds.map((userId) => ({
      userId,
      displayName: NAMES[userId] ?? "?",
      joinedAt: finishedAt,
      arrivedAt: finishedAt,
    })),
    leaderUserId: helperIds[0] ?? null,
    startedAt: finishedAt,
    finishedAt,
    cancelledAt: null,
    result: {
      minutes: 10,
      areaM2: 0,
      snowDepthM: 0,
      snowKg: 0,
      calories: 58,
      workPoints: 1000,
      finishedBy: helperIds[0] ?? "",
    },
    ratings: null,
    thankedAt: null,
  };
}

const referral = (inviter: string, invitee: string, createdAt: string): Referral => ({
  inviterUserId: inviter,
  inviteeUserId: invitee,
  createdAt,
});

test("再会: 前の別の依頼でも一緒だった参加者だけを数える", () => {
  // Arrange: 昨日 A・B、今日 A・B・C
  const first = doneRequest(1, [HELPER_A, HELPER_B], YESTERDAY_AT);
  const second = doneRequest(2, [HELPER_A, HELPER_B, HELPER_C], TODAY_AT);
  const finished = [first, second];

  // Act & Assert
  expect(reunionPartners(second, HELPER_A, finished)).toEqual([HELPER_B]);
  expect(reunionPartners(second, HELPER_C, finished)).toEqual([]);
  // 最初の依頼の時点では、まだ再会ではない
  expect(reunionPartners(first, HELPER_A, finished)).toEqual([]);
});

test("再会: 前の依頼が同じ人とでも、別々の依頼なら再会ではない", () => {
  // Arrange: A と B は別々の依頼に参加
  const aOnly = doneRequest(1, [HELPER_A], YESTERDAY_AT);
  const bOnly = doneRequest(2, [HELPER_B], YESTERDAY_AT);
  const together = doneRequest(3, [HELPER_A, HELPER_B], TODAY_AT);

  // Act & Assert
  expect(reunionPartners(together, HELPER_A, [aOnly, bOnly, together])).toEqual([]);
});

test("勧誘: 誘われた人が初めて終えたとき、誘った人に +500・誘われた人に +200", () => {
  // Arrange
  const firstOfB = doneRequest(1, [HELPER_B], YESTERDAY_AT);
  const secondOfB = doneRequest(2, [HELPER_B], TODAY_AT);
  const invite = referral(HELPER_A, HELPER_B, "2026-11-22T00:00:00.000Z");

  // Act
  const awards = recruitAwards(invite, [secondOfB, firstOfB]);

  // Assert: 2 回目ではなく、初めて終えた依頼でだけ入る(1 人につき 1 回)
  expect(firstFinishOf(HELPER_B, [secondOfB, firstOfB])?.id).toBe(firstOfB.id);
  expect(awards).toEqual([
    { userId: HELPER_A, points: 500, at: YESTERDAY_AT, kind: "recruit", requestId: firstOfB.id },
    { userId: HELPER_B, points: 200, at: YESTERDAY_AT, kind: "firstFinish", requestId: firstOfB.id },
  ]);
});

test("勧誘: まだ雪かきを終えていない人や、誘われる前に終えていた人では入らない", () => {
  // Arrange
  const doneBeforeInvite = doneRequest(1, [HELPER_B], YESTERDAY_AT);
  const lateInvite = referral(HELPER_A, HELPER_B, TODAY_AT);
  const notYet = referral(HELPER_A, HELPER_C, YESTERDAY_AT);

  // Act & Assert
  expect(recruitAwards(lateInvite, [doneBeforeInvite])).toEqual([]);
  expect(recruitAwards(notYet, [doneBeforeInvite])).toEqual([]);
});

test("ランキングは 4 種類のポイントを合計し、自分の内訳を返す", () => {
  // Arrange: A が B を誘う → 昨日 A・B が初めて一緒に → 今日また A・B(再会)。今日 A に星 5
  const invite = referral(HELPER_A, HELPER_B, "2026-11-22T00:00:00.000Z");
  const first = doneRequest(1, [HELPER_A, HELPER_B], YESTERDAY_AT);
  const second = { ...doneRequest(2, [HELPER_A, HELPER_B], TODAY_AT), ratings: { [HELPER_A]: 5 }, thankedAt: TODAY_LATER_AT };

  // Act
  const total = buildRanking([first, second], "total", NOW, HELPER_A, [invite]);

  // Assert
  // A: 雪かき 1000×2 + 評価 500 + 勧誘 500 + 再会 150 = 3150
  // B: 雪かき 1000×2 + はじめての雪かき 200 + 再会 150 = 2350
  expect(total).toEqual([
    {
      rank: 1,
      displayName: "ゆきお",
      points: 3150,
      breakdown: { work: 2000, rating: 500, recruit: 500, reunion: 150 },
      isMe: true,
    },
    {
      rank: 2,
      displayName: "あおい",
      points: 2350,
      breakdown: { work: 2000, rating: 0, recruit: 200, reunion: 150 },
      isMe: false,
    },
  ]);
});

test("デイリーは日本時間の今日の分だけ(昨日入った勧誘ポイントは数えない)", () => {
  // Arrange
  const invite = referral(HELPER_A, HELPER_B, "2026-11-22T00:00:00.000Z");
  const first = doneRequest(1, [HELPER_A, HELPER_B], YESTERDAY_AT);
  const second = doneRequest(2, [HELPER_A, HELPER_B], TODAY_AT);

  // Act
  const daily = buildRanking([first, second], "daily", NOW, null, [invite]);

  // Assert: 今日は雪かき 1000 + 再会 150 だけ
  expect(daily.map((e) => [e.displayName, e.points, e.breakdown.recruit])).toEqual([
    ["ゆきお", 1150, 0],
    ["あおい", 1150, 0],
  ]);
  expect(daily.map((e) => e.rank)).toEqual([1, 1]);
});

test("お疲れ様の画面用: 依頼 1 件の自分の内訳(再会した人の名前・はじめての雪かきボーナス)", () => {
  // Arrange
  const invite = referral(HELPER_A, HELPER_B, "2026-11-22T00:00:00.000Z");
  const first = doneRequest(1, [HELPER_A, HELPER_B], YESTERDAY_AT);
  const second = { ...doneRequest(2, [HELPER_A, HELPER_B, HELPER_C], TODAY_AT), ratings: { [HELPER_B]: 4 }, thankedAt: TODAY_LATER_AT };
  const finished = [first, second];

  // Act
  const bFirst = pointsForRequest(first, HELPER_B, finished, [invite]);
  const bSecond = pointsForRequest(second, HELPER_B, finished, [invite]);

  // Assert
  expect(bFirst).toEqual({
    workPoints: 1000,
    stars: null,
    ratingPoints: 0,
    reunion: { points: 0, partners: [] },
    firstFinishBonus: 200,
    total: 1200,
  });
  expect(bSecond).toEqual({
    workPoints: 1000,
    stars: 4,
    ratingPoints: 400,
    reunion: { points: 150, partners: ["ゆきお"] },
    firstFinishBonus: 0,
    total: 1550,
  });
});
