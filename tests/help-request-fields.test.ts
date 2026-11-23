import { describe, expect, test } from "vitest";
import { amountOf, toolsTextOf } from "../public/liff/help-request-fields.js";

describe("toolsTextOf(道具のまとめ)", () => {
  test("チェックした道具だけを、数つきでまとめる", () => {
    const text = toolsTextOf([
      { label: "スコップ(プラスチック)", isChecked: true, count: 2 },
      { label: "スコップ(スチール)", isChecked: false, count: 1 },
      { label: "ママさんダンプ", isChecked: true, count: 1 },
    ]);
    expect(text).toBe("スコップ(プラスチック)×2、ママさんダンプ×1");
  });

  test("数が 0 や空なら、数を付けない", () => {
    expect(toolsTextOf([{ label: "ママさんダンプ", isChecked: true, count: Number.NaN }])).toBe("ママさんダンプ");
    expect(toolsTextOf([{ label: "ママさんダンプ", isChecked: true, count: 0 }])).toBe("ママさんダンプ");
  });

  test("何もチェックしていなければ空", () => {
    expect(toolsTextOf([{ label: "ママさんダンプ", isChecked: false, count: 1 }])).toBe("");
  });
});

describe("amountOf(雪の深さ)", () => {
  test("決まった値はそのまま", () => {
    expect(amountOf("lots")).toBe("lots");
  });

  test("知らない値や空は「ふつう」", () => {
    expect(amountOf("")).toBe("normal");
    expect(amountOf("deep")).toBe("normal");
  });
});
