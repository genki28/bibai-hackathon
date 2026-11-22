import { describe, expect, test } from "vitest";
import {
  COMBO_DECAY_STEP_MS,
  COMBO_GRACE_MS,
  EMPTY_COMBO,
  FLOCK_MAX_SIZE,
  FLOCK_MIN_SIZE,
  HERO_CYCLE_MS,
  HERO_FRAME_COUNT,
  HERO_FRAME_STARTS,
  MAX_LEVEL,
  PILE_MIN_REMAINING,
  QUICK_FRAME_STARTS,
  QUICK_THROW_MS,
  THROW_FRAME,
  cheerFor,
  comboAt,
  createRandom,
  digLevel,
  flockSize,
  fitToHeight,
  formatElapsed,
  frameRect,
  heroFrameIndex,
  levelProgress,
  moundSize,
  pileRemaining,
  registerTap,
} from "../public/liff/pixel-game.js";

const MINUTE = 60_000;

describe("経過時間とレベル", () => {
  test("経過時間は 1 時間までは「分:秒」、それより長いと「時:分:秒」", () => {
    // Arrange / Act / Assert
    expect(formatElapsed(65_000)).toBe("01:05");
    expect(formatElapsed(3_725_000)).toBe("1:02:05");
    expect(formatElapsed(-5_000)).toBe("00:00");
  });

  test("雪かきレベルは 5 分ごとに 1 つ上がり、いちばん上で止まる", () => {
    // Arrange / Act / Assert
    expect(digLevel(0)).toBe(1);
    expect(digLevel(4.9 * MINUTE)).toBe(1);
    expect(digLevel(5 * MINUTE)).toBe(2);
    expect(digLevel(600 * MINUTE)).toBe(MAX_LEVEL);
  });

  test("次のレベルまでの進み具合は 0〜1 で、いちばん上では 1", () => {
    // Arrange / Act / Assert
    expect(levelProgress(0)).toBe(0);
    expect(levelProgress(2.5 * MINUTE)).toBeCloseTo(0.5);
    expect(levelProgress(600 * MINUTE)).toBe(1);
  });
});

describe("玄関前の雪の山", () => {
  test("はじめは山盛りで、30 分で最小まで減り、それ以上は減らない", () => {
    // Arrange / Act / Assert
    expect(pileRemaining(0)).toBe(1);
    expect(pileRemaining(15 * MINUTE)).toBeCloseTo((1 + PILE_MIN_REMAINING) / 2);
    expect(pileRemaining(30 * MINUTE)).toBeCloseTo(PILE_MIN_REMAINING);
    expect(pileRemaining(90 * MINUTE)).toBeCloseTo(PILE_MIN_REMAINING);
  });
});

describe("コンボ", () => {
  test("続けてタップするとコンボが 1 ずつ伸びる", () => {
    // Arrange
    const first = registerTap(EMPTY_COMBO, 1_000);

    // Act
    const third = registerTap(registerTap(first, 1_300), 1_600);

    // Assert
    expect(third.count).toBe(3);
  });

  test("タップしても元の状態は変わらない", () => {
    // Arrange
    const before = registerTap(EMPTY_COMBO, 1_000);

    // Act
    registerTap(before, 1_200);

    // Assert
    expect(before.count).toBe(1);
  });

  test("手を止めてもしばらくは保ち、そのあと少しずつ減って 0 で止まる", () => {
    // Arrange
    const state = { count: 5, lastTapAt: 0 };

    // Act / Assert
    expect(comboAt(state, COMBO_GRACE_MS)).toBe(5);
    expect(comboAt(state, COMBO_GRACE_MS + COMBO_DECAY_STEP_MS)).toBe(4);
    expect(comboAt(state, COMBO_GRACE_MS + 3 * COMBO_DECAY_STEP_MS)).toBe(2);
    expect(comboAt(state, COMBO_GRACE_MS + 100 * COMBO_DECAY_STEP_MS)).toBe(0);
  });

  test("減り始めてからタップすると、減ったところから伸びる", () => {
    // Arrange
    const state = { count: 5, lastTapAt: 0 };

    // Act
    const next = registerTap(state, COMBO_GRACE_MS + 2 * COMBO_DECAY_STEP_MS);

    // Assert
    expect(next.count).toBe(4);
  });

  test("節目のコンボでだけ声が出る", () => {
    // Arrange / Act / Assert
    expect(cheerFor(9)).toBeNull();
    expect(cheerFor(10)).toBe("COOL!");
    expect(cheerFor(20)).toBe("GREAT!");
    expect(cheerFor(30)).toBe("SUPER!");
    expect(cheerFor(35)).toBeNull();
    expect(cheerFor(70)).toBe("SUPER!");
  });
});

describe("マガンの群れと乱数", () => {
  test("レベルが上がるほど群れが大きくなり、上限で止まる", () => {
    // Arrange / Act / Assert
    expect(flockSize(1)).toBe(FLOCK_MIN_SIZE);
    expect(flockSize(3)).toBe(FLOCK_MIN_SIZE + 2);
    expect(flockSize(99)).toBe(FLOCK_MAX_SIZE);
  });

  test("同じ seed の乱数は毎回同じ並びで、0 以上 1 未満", () => {
    // Arrange
    const a = createRandom(42);
    const b = createRandom(42);

    // Act
    const listA = Array.from({ length: 20 }, a);
    const listB = Array.from({ length: 20 }, b);

    // Assert
    expect(listA).toEqual(listB);
    expect(listA.every((n) => n >= 0 && n < 1)).toBe(true);
  });
});

describe("主人公のコマの選び方", () => {
  const auto = (now: number) => heroFrameIndex({ now, quickStartedAt: Number.NEGATIVE_INFINITY, isReduced: false });

  test("自動では 差す → 持ち上げる → 振りかぶる → 投げる をくり返す", () => {
    // Arrange
    const times = HERO_FRAME_STARTS.map((start) => start + 10);

    // Act
    const frames = times.map(auto);

    // Assert
    expect(frames).toEqual([0, 1, 2, THROW_FRAME]);
    expect(auto(HERO_CYCLE_MS + 10)).toBe(0);
  });

  test("タップの直後は、すばやく 持ち上げる → 振りかぶる → 投げる、終わると自動に戻る", () => {
    // Arrange
    const quickStartedAt = 100;
    const at = (t: number) => heroFrameIndex({ now: quickStartedAt + t, quickStartedAt, isReduced: false });

    // Act
    const frames = [0, ...QUICK_FRAME_STARTS.slice(1)].map((t) => at(t + 1));

    // Assert
    expect(frames).toEqual([1, 2, THROW_FRAME]);
    expect(at(QUICK_THROW_MS)).toBe(auto(quickStartedAt + QUICK_THROW_MS));
  });

  test("動きを減らす設定では、タップの直後以外は 0 のまま", () => {
    // Arrange / Act
    const still = heroFrameIndex({ now: 1_400, quickStartedAt: Number.NEGATIVE_INFINITY, isReduced: true });
    const tapped = heroFrameIndex({ now: 1_200, quickStartedAt: 1_000, isReduced: true });

    // Assert
    expect(still).toBe(0);
    expect(tapped).toBe(THROW_FRAME);
  });

  test("コマの数は 4 で、index 番目のコマは横に frameWidth ずつずれた位置から切り出す", () => {
    // Arrange / Act
    const rect = frameRect(2, 271, 247);

    // Assert
    expect(HERO_FRAME_COUNT).toBe(4);
    expect(rect).toEqual({ sx: 542, sy: 0, sw: 271, sh: 247 });
  });
});

describe("配置の計算", () => {
  test("縦横の比をそのままに、決めた高さに合わせる", () => {
    // Arrange / Act
    const size = fitToHeight(271, 247, 109);

    // Assert
    expect(size).toEqual({ width: 120, height: 109 });
  });

  test("雪の山は残りの割合に合わせて、最小〜最大の大きさになる", () => {
    // Arrange
    const range = { minHalfWidth: 10, maxHalfWidth: 50, minHeight: 4, maxHeight: 44 };

    // Act / Assert
    expect(moundSize(1, range)).toEqual({ halfWidth: 50, height: 44 });
    expect(moundSize(0.5, range)).toEqual({ halfWidth: 30, height: 24 });
    expect(moundSize(-1, range)).toEqual({ halfWidth: 10, height: 4 });
  });
});
