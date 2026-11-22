import { describe, expect, test } from "vitest";
import { ACTIVE_DONE_WINDOW_MS, findActiveFor, isActiveFor } from "../src/help-requests/active.js";
import type { HelpRequest, HelpRequestStatus, Helper } from "../src/help-requests/model.js";

// テスト用の架空のユーザー ID
const ELDER_ID = `U${"d".repeat(32)}`;
const HELPER_A = `U${"a".repeat(32)}`;
const HELPER_B = `U${"b".repeat(32)}`;
const NOW = new Date("2026-11-23T07:00:00Z");
const minutesAgo = (minutes: number): string => new Date(NOW.getTime() - minutes * 60_000).toISOString();

function helper(userId: string, joinedMinutesAgo = 30): Helper {
  return { userId, displayName: "ゆきお", joinedAt: minutesAgo(joinedMinutesAgo), arrivedAt: null };
}

function request(overrides: Partial<HelpRequest> & { status: HelpRequestStatus }): HelpRequest {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    userId: ELDER_ID,
    amount: "normal",
    name: null,
    address: null,
    lat: null,
    lng: null,
    depth: null,
    tools: null,
    createdAt: minutesAgo(60),
    helpers: [helper(HELPER_A)],
    leaderUserId: null,
    startedAt: null,
    finishedAt: null,
    cancelledAt: null,
    result: null,
    ratings: null,
    thankedAt: null,
    ...overrides,
  };
}

describe("isActiveFor(続きに戻るべき依頼か)", () => {
  test.each<[HelpRequestStatus, boolean]>([
    ["accepted", true],
    ["working", true],
    ["waiting", false],
    ["cancelled", false],
  ])("状態が %s なら %s", (status, expected) => {
    // Arrange
    const r = request({ status });

    // Act
    const actual = isActiveFor(r, HELPER_A, NOW);

    // Assert
    expect(actual).toBe(expected);
  });

  test("終わってから 1 時間以内の done は返す", () => {
    // Arrange
    const r = request({ status: "done", finishedAt: new Date(NOW.getTime() - ACTIVE_DONE_WINDOW_MS).toISOString() });

    // Act
    const actual = isActiveFor(r, HELPER_A, NOW);

    // Assert
    expect(actual).toBe(true);
  });

  test("終わってから 1 時間を過ぎた done は返さない", () => {
    // Arrange
    const r = request({ status: "done", finishedAt: new Date(NOW.getTime() - ACTIVE_DONE_WINDOW_MS - 1).toISOString() });

    // Act
    const actual = isActiveFor(r, HELPER_A, NOW);

    // Assert
    expect(actual).toBe(false);
  });

  test("参加していない人(他人の依頼・依頼した本人)には返さない", () => {
    // Arrange
    const r = request({ status: "working" });

    // Act
    const forOther = isActiveFor(r, HELPER_B, NOW);
    const forElder = isActiveFor(r, ELDER_ID, NOW);

    // Assert
    expect(forOther).toBe(false);
    expect(forElder).toBe(false);
  });
});

describe("findActiveFor(参加中の雪かきを 1 つ選ぶ)", () => {
  test("参加中のものがなければ null", () => {
    // Arrange
    const requests = [request({ status: "working", helpers: [helper(HELPER_B)] })];

    // Act
    const actual = findActiveFor(requests, HELPER_A, NOW);

    // Assert
    expect(actual).toBeNull();
  });

  test("終わったものより、続いているものを優先する", () => {
    // Arrange
    const done = request({ id: "done", status: "done", finishedAt: minutesAgo(5) });
    const working = request({ id: "working", status: "working" });

    // Act
    const actual = findActiveFor([done, working], HELPER_A, NOW);

    // Assert
    expect(actual?.id).toBe("working");
  });

  test("続いているものが 2 つあれば、最後に参加したほう", () => {
    // Arrange
    const older = request({ id: "older", status: "accepted", helpers: [helper(HELPER_A, 50)] });
    const newer = request({ id: "newer", status: "accepted", helpers: [helper(HELPER_A, 10)] });

    // Act
    const actual = findActiveFor([newer, older], HELPER_A, NOW);

    // Assert
    expect(actual?.id).toBe("newer");
  });

  test("終わったものだけなら、いちばん最近終わったもの", () => {
    // Arrange
    const earlier = request({ id: "earlier", status: "done", finishedAt: minutesAgo(40) });
    const later = request({ id: "later", status: "done", finishedAt: minutesAgo(10) });

    // Act
    const actual = findActiveFor([later, earlier], HELPER_A, NOW);

    // Assert
    expect(actual?.id).toBe("later");
  });
});
