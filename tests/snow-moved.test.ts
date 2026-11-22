import { describe, expect, test } from "vitest";
import { COMPARISONS, announcementFor, comparisonFor, teamScoops } from "../public/liff/snow-moved.js";

describe("teamScoops(みんなのすくった回数)", () => {
  const helpers = [
    { userId: "me", scoops: 5 },
    { userId: "a", scoops: 10 },
    { userId: "b" },
  ];

  test("ほかの人はサーバーの回数、自分は端末の回数を使う", () => {
    expect(teamScoops(helpers, "me", 8)).toBe(18);
  });

  test("端末の回数がサーバーより少なければ、サーバーの回数を使う", () => {
    expect(teamScoops(helpers, "me", 2)).toBe(15);
  });

  test("参加者の一覧に自分がいなくても、自分の回数を足す", () => {
    expect(teamScoops([{ userId: "a", scoops: 3 }], "me", 4)).toBe(7);
  });
});

describe("comparisonFor(動かした雪のたとえ)", () => {
  test("届いた中でいちばん大きいたとえ", () => {
    expect(comparisonFor(COMPARISONS[1].kg + 1)).toEqual(COMPARISONS[1]);
  });

  test("いちばん小さいたとえにも届いていなければ null", () => {
    expect(comparisonFor(COMPARISONS[0].kg - 1)).toBeNull();
  });
});

describe("announcementFor(実況のことば)", () => {
  const at = (mine: number, team: number) => ({ mine, team });

  test("回数が増えていなければ、何も言わない", () => {
    expect(announcementFor(at(3, 3), at(3, 3))).toBeNull();
  });

  test("自分が 10 杯ごとに、動かした重さを言う", () => {
    expect(announcementFor(at(9, 9), at(10, 10))).toEqual({ kind: "mine", text: "10杯!約35キロ動かしました" });
  });

  test("節目でなければ何も言わない", () => {
    expect(announcementFor(at(10, 10), at(11, 11))).toBeNull();
  });

  test("みんなで 50 杯ごとに言う(自分の節目より優先)", () => {
    expect(announcementFor(at(19, 49), at(20, 50))).toEqual({
      kind: "team",
      text: "みんなで50杯、約175キロ動かしました!",
    });
  });

  test("たとえの重さを超えたら、いちばん優先して言う", () => {
    // 1 杯 3.5kg。29 杯 = 101.5kg で「お米 10 袋ぶん(100kg)」を超える
    expect(announcementFor(at(1, 28), at(2, 29))).toEqual({
      kind: "milestone",
      text: `みんなで${COMPARISONS[0].label}の雪を動かしました!`,
    });
  });

  test("ゴールや残りの量は言わない(「あと少し」などは使わない)", () => {
    const texts = Array.from({ length: 400 }, (_, i) => announcementFor(at(i, i), at(i + 1, i + 1))?.text ?? "");
    expect(texts.some((t) => t.includes("あと"))).toBe(false);
  });
});
