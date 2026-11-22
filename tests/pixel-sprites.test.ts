import { describe, expect, test } from "vitest";
import {
  CROWN,
  FONT,
  FONT_HEIGHT,
  FONT_PALETTE,
  FONT_WIDTH,
  GOOSE_FRAMES,
  PALETTE,
  spriteSize,
  textWidth,
  toFontText,
  validateSprite,
} from "../public/liff/pixel-sprites.js";

describe("validateSprite", () => {
  test("形が正しいスプライトには問題がない", () => {
    // Arrange
    const rows = [".K.", "KKK"];

    // Act
    const errors = validateSprite(rows, { K: "#000" });

    // Assert
    expect(errors).toEqual([]);
  });

  test("行の長さがそろっていないと、その行を知らせる", () => {
    // Arrange
    const rows = ["KKK", "KK"];

    // Act
    const errors = validateSprite(rows, { K: "#000" });

    // Assert
    expect(errors).toEqual(["2 行目の長さが 2(3 のはず)"]);
  });

  test("色の対応表にない文字を使うと知らせる", () => {
    // Arrange
    const rows = ["KZ."];

    // Act
    const errors = validateSprite(rows, { K: "#000" });

    // Assert
    expect(errors).toEqual(["1 行目の「Z」は色の対応表にありません"]);
  });

  test("行がないスプライトは問題あり", () => {
    // Arrange / Act
    const errors = validateSprite([], { K: "#000" });

    // Assert
    expect(errors).toEqual(["行がありません"]);
  });
});

describe("用意したスプライト", () => {
  test("マガンの 2 コマはどれも形が正しく、同じ大きさ", () => {
    // Arrange
    const frames = Object.values(GOOSE_FRAMES);

    // Act
    const errors = frames.flatMap((frame) => validateSprite(frame, PALETTE));
    const sizes = frames.map(spriteSize);

    // Assert
    expect(errors).toEqual([]);
    expect(sizes[0]).toEqual(sizes[1]);
  });

  test("リーダーの王冠は形が正しい", () => {
    // Arrange / Act
    const errors = validateSprite(CROWN, PALETTE);

    // Assert
    expect(errors).toEqual([]);
  });

  test("ドットの文字はすべて 3×5 で形が正しい", () => {
    // Arrange
    const glyphs = Object.entries(FONT);

    // Act
    const errors = glyphs.flatMap(([ch, glyph]) => validateSprite(glyph, FONT_PALETTE).map((e) => `${ch}: ${e}`));
    const wrongSize = glyphs.filter(([, glyph]) => {
      const size = spriteSize(glyph);
      return size.width !== FONT_WIDTH || size.height !== FONT_HEIGHT;
    });

    // Assert
    expect(errors).toEqual([]);
    expect(wrongSize).toEqual([]);
  });

  test("画面に出す言葉は、すべてドットの文字で書ける", () => {
    // Arrange
    const words = ["+1", "COMBO x99", "COOL!", "GREAT!", "SUPER!", "LEVEL UP!", "JOIN!", "LV.9", "0123456789"];

    // Act
    const missing = words.flatMap((word) => [...word].filter((ch) => !(ch in FONT)));

    // Assert
    expect(missing).toEqual([]);
  });
});

describe("ドットの文字の並べ方", () => {
  test("文字の幅は 1 文字 3 ドット + 間 1 ドットで、拡大の倍率をかける", () => {
    // Arrange / Act / Assert
    expect(textWidth("+1")).toBe(7);
    expect(textWidth("+1", 2)).toBe(14);
    expect(textWidth("")).toBe(0);
  });

  test("小文字は大文字にそろえ、× は x にし、用意のない文字は除く", () => {
    // Arrange / Act
    const text = toFontText("Combo ×5 ★");

    // Assert
    expect(text).toBe("COMBO x5 ");
  });
});
