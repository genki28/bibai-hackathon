import { describe, expect, test } from "vitest";
import { resumePageFor, wantsList } from "../public/liff/resume-route.js";

// テスト用の架空のユーザー ID
const ME = `U${"a".repeat(32)}`;
const OTHER = `U${"b".repeat(32)}`;
const ID = "11111111-1111-4111-8111-111111111111";

function request(status: string, arrivedAt: string | null = null, userId = ME) {
  return { id: ID, status, helpers: [{ userId, arrivedAt }] };
}

describe("resumePageFor(入口での行き先)", () => {
  test.each<[string, string | null, string | null]>([
    ["accepted", null, "helper-place.html"],
    ["accepted", "2026-11-23T07:00:00Z", "helper-gather.html"],
    ["working", null, "helper-working.html"],
    ["working", "2026-11-23T07:00:00Z", "helper-working.html"],
    ["done", "2026-11-23T07:00:00Z", "finish.html"],
    ["waiting", null, null],
    ["cancelled", null, null],
  ])("状態 %s・到着 %s なら %s へ", (status, arrivedAt, expected) => {
    // Arrange
    const active = request(status, arrivedAt);

    // Act
    const page = resumePageFor(active, ME);

    // Assert
    expect(page).toBe(expected);
  });

  test("参加中の雪かきがなければ(null)移らない", () => {
    // Arrange・Act
    const page = resumePageFor(null, ME);

    // Assert
    expect(page).toBeNull();
  });

  test("自分が参加者にいなければ移らない", () => {
    // Arrange
    const active = request("working", null, OTHER);

    // Act
    const page = resumePageFor(active, ME);

    // Assert
    expect(page).toBeNull();
  });

  test("この端末でお疲れ様の画面を見た依頼なら、終わっていても移らない", () => {
    // Arrange
    const active = request("done", "2026-11-23T07:00:00Z");

    // Act
    const page = resumePageFor(active, ME, { seenFinishIds: [ID] });

    // Assert
    expect(page).toBeNull();
  });
});

describe("wantsList(?list=1 なら自動で移らない)", () => {
  test.each<[string, boolean]>([
    ["?list=1", true],
    ["?list=1&id=x", true],
    ["", false],
    ["?list=0", false],
    ["?preview", false],
  ])("%s → %s", (search, expected) => {
    // Arrange・Act
    const actual = wantsList(search);

    // Assert
    expect(actual).toBe(expected);
  });
});
