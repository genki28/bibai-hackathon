import { describe, expect, test } from "vitest";
import {
  MAX_CREW,
  crewFrameOffset,
  crewLayout,
  crewSlot,
  easeOut,
  lerp,
  shortName,
} from "../public/liff/pixel-crew.js";

// 雪かき中の画面と同じ数字(362×272 の小さなキャンバス、主人公のコマは 271×247)
const SCENE = { sceneHeight: 272, centerX: 181, feetY: 236, frameAspect: 271 / 247 };
const SCENE_WIDTH = 362;

describe("crewSlot(何人目が左右どちらの何番目か)", () => {
  test("左右へ交互に、外側へ広がって置く。左は右向き、右は左向き(反転)", () => {
    // Arrange
    const indexes = [0, 1, 2, 3, 4];

    // Act
    const slots = indexes.map(crewSlot);

    // Assert
    expect(slots).toEqual([
      { side: "left", rank: 0, isFlipped: false },
      { side: "right", rank: 0, isFlipped: true },
      { side: "left", rank: 1, isFlipped: false },
      { side: "right", rank: 1, isFlipped: true },
      { side: "left", rank: 2, isFlipped: false },
    ]);
  });
});

describe("crewLayout(並べたときの位置と大きさ)", () => {
  test.each([1, 2, 3, 4, 5])("%i 人のとき、全員が画面の中に収まり、人数ぶん並ぶ", (count) => {
    // Arrange / Act
    const crew = crewLayout(count, SCENE);

    // Assert
    expect(crew).toHaveLength(count);
    crew.forEach((person) => {
      expect(person.left).toBeGreaterThanOrEqual(-2);
      expect(person.left + person.width).toBeLessThanOrEqual(SCENE_WIDTH);
      expect(person.top).toBeGreaterThanOrEqual(0);
    });
  });

  test.each([1, 2, 3, 4, 5])("%i 人のとき、左の人は真ん中より左、右の人は真ん中より右にいる", (count) => {
    // Arrange / Act
    const crew = crewLayout(count, SCENE);

    // Assert
    crew.forEach((person) => {
      if (person.side === "left") expect(person.bodyX).toBeLessThan(SCENE.centerX);
      else expect(person.bodyX).toBeGreaterThan(SCENE.centerX);
    });
  });

  test("1 人のときは、画面の高さの 40% の大きさで、真ん中より左に右向きで立つ", () => {
    // Arrange / Act
    const [person] = crewLayout(1, SCENE);

    // Assert
    expect(person.height).toBe(Math.round(272 * 0.4));
    expect(person.isFlipped).toBe(false);
    expect(person.feetY).toBe(SCENE.feetY);
  });

  test("人数が多いほど小さくなる", () => {
    // Arrange / Act
    const heights = [1, 3, 5].map((count) => crewLayout(count, SCENE)[0].height);

    // Assert
    expect(heights[0]).toBeGreaterThan(heights[1]);
    expect(heights[1]).toBeGreaterThan(heights[2]);
  });

  test("外側(奥)の人ほど小さく、少し上に立ち、真ん中から遠い", () => {
    // Arrange / Act
    const [inner, , middle, , outer] = crewLayout(5, SCENE);

    // Assert
    expect(outer.height).toBeLessThan(middle.height);
    expect(middle.height).toBeLessThan(inner.height);
    expect(outer.feetY).toBeLessThan(middle.feetY);
    expect(middle.feetY).toBeLessThan(inner.feetY);
    expect(outer.bodyX).toBeLessThan(middle.bodyX);
    expect(middle.bodyX).toBeLessThan(inner.bodyX);
  });

  test("2 人のときは、真ん中をはさんで左右にちょうど同じ距離で向き合う", () => {
    // Arrange / Act
    const [left, right] = crewLayout(2, SCENE);

    // Assert
    expect(SCENE.centerX - left.bodyX).toBe(right.bodyX - SCENE.centerX);
    expect(left.height).toBe(right.height);
  });

  test("0 人や定員より多い数は、1〜定員にそろえる", () => {
    // Arrange / Act / Assert
    expect(crewLayout(0, SCENE)).toHaveLength(1);
    expect(crewLayout(9, SCENE)).toHaveLength(MAX_CREW);
  });
});

describe("そのほかの計算", () => {
  test("人ごとにコマの始まりをずらし、ひと回りの長さを超えない", () => {
    // Arrange
    const cycleMs = 1800;

    // Act
    const offsets = [0, 1, 2, 3, 4].map((i) => crewFrameOffset(i, cycleMs));

    // Assert
    expect(new Set(offsets).size).toBe(5);
    expect(offsets.every((ms) => ms >= 0 && ms < cycleMs)).toBe(true);
  });

  test("長い名前は短くして「…」を付け、空の名前は「なかま」にする", () => {
    // Arrange / Act / Assert
    expect(shortName("たなか")).toBe("たなか");
    expect(shortName("ゆきかきマスター太郎")).toBe("ゆきかきマ…");
    expect(shortName("  ")).toBe("なかま");
    expect(shortName(undefined)).toBe("なかま");
  });

  test("lerp と easeOut は 0〜1 の外に出ない", () => {
    // Arrange / Act / Assert
    expect(lerp(10, 20, 0.5)).toBe(15);
    expect(lerp(10, 20, 2)).toBe(20);
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
    expect(easeOut(0.5)).toBeGreaterThan(0.5);
  });
});
