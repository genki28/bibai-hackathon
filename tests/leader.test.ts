import { expect, test } from "vitest";
import { canFinish, canStart, leaderCandidates, pickLeader } from "../src/help-requests/leader.js";
import type { Helper, HelpRequest } from "../src/help-requests/model.js";

// テスト用の架空のユーザー ID
const ELDER_ID = `U${"d".repeat(32)}`;
const HELPER_A = `U${"a".repeat(32)}`;
const HELPER_B = `U${"b".repeat(32)}`;
const HELPER_C = `U${"c".repeat(32)}`;
const AT = "2026-11-23T07:00:00.000Z";

const helper = (userId: string, isArrived: boolean): Helper => ({
  userId,
  displayName: userId.slice(1, 2),
  joinedAt: AT,
  arrivedAt: isArrived ? AT : null,
});

const requestWith = (helpers: readonly Helper[], leaderUserId: string | null): HelpRequest => ({
  id: "00000000-0000-4000-8000-000000000001",
  userId: ELDER_ID,
  amount: "normal",
  name: null,
  address: null,
  lat: null,
  lng: null,
  depth: null,
  tools: null,
  status: leaderUserId ? "working" : "accepted",
  createdAt: AT,
  helpers,
  leaderUserId,
  startedAt: leaderUserId ? AT : null,
  finishedAt: null,
  cancelledAt: null,
  result: null,
  ratings: null,
  thankedAt: null,
});

test("リーダーの候補は到着した人。だれも到着していなければ参加者全員", () => {
  // Arrange
  const mixed = [helper(HELPER_A, false), helper(HELPER_B, true), helper(HELPER_C, true)];
  const nobodyArrived = [helper(HELPER_A, false), helper(HELPER_B, false)];

  // Act & Assert
  expect(leaderCandidates(mixed).map((h) => h.userId)).toEqual([HELPER_B, HELPER_C]);
  expect(leaderCandidates(nobodyArrived).map((h) => h.userId)).toEqual([HELPER_A, HELPER_B]);
});

test("乱数に合わせて候補から 1 人を選ぶ(乱数を差し替えると決まった結果になる)", () => {
  // Arrange
  const helpers = [helper(HELPER_A, false), helper(HELPER_B, true), helper(HELPER_C, true)];

  // Act & Assert
  expect(pickLeader(helpers, () => 0)?.userId).toBe(HELPER_B);
  expect(pickLeader(helpers, () => 0.49)?.userId).toBe(HELPER_B);
  expect(pickLeader(helpers, () => 0.5)?.userId).toBe(HELPER_C);
  // 到着していない A は、どんな乱数でも選ばれない
  expect(pickLeader(helpers, () => 0.999)?.userId).toBe(HELPER_C);
});

test("乱数が範囲の外でも候補の中から選び、参加者がいなければ null", () => {
  // Arrange
  const helpers = [helper(HELPER_A, true), helper(HELPER_B, true)];

  // Act & Assert
  expect(pickLeader(helpers, () => 1)?.userId).toBe(HELPER_B);
  expect(pickLeader(helpers, () => -1)?.userId).toBe(HELPER_A);
  expect(pickLeader([], () => 0)).toBeNull();
});

test("開始を押せるのは、到着した参加者だけ", () => {
  // Arrange
  const request = requestWith([helper(HELPER_A, true), helper(HELPER_B, false)], null);

  // Act & Assert
  expect(canStart(request, HELPER_A)).toBe(true);
  expect(canStart(request, HELPER_B)).toBe(false);
  expect(canStart(request, HELPER_C)).toBe(false);
});

test("終了できるのはリーダーだけ。リーダーの記録がない古い依頼は参加者ならだれでも", () => {
  // Arrange
  const helpers = [helper(HELPER_A, true), helper(HELPER_B, true)];
  const withLeader = requestWith(helpers, HELPER_B);
  const legacy = { ...requestWith(helpers, null), status: "working" as const };

  // Act & Assert
  expect(canFinish(withLeader, HELPER_B)).toBe(true);
  expect(canFinish(withLeader, HELPER_A)).toBe(false);
  expect(canFinish(legacy, HELPER_A)).toBe(true);
  expect(canFinish(legacy, HELPER_C)).toBe(false);
});
