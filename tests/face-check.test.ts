import { describe, expect, test } from "vitest";
import {
  CHALLENGE_FRAMES_REQUIRED,
  FACE_MATCH_THRESHOLD,
  LIVENESS_CHALLENGES,
  advanceChallenge,
  areChallengesDone,
  buildVerifyPayload,
  describeMatch,
  faceSimilarity,
  isChallengeMet,
  judgeFaceMatch,
  pickChallenges,
  pickLargestFace,
} from "../public/liff/face-check.js";
import type { LivenessChallenge } from "../public/liff/face-check.js";

// テスト用の作りものの「顔の特徴の数値」(本物の人の顔から作ったものではありません)
const LENGTH = 1024;
const BASE = Array.from({ length: LENGTH }, (_, i) => Math.sin(i) * 0.05);
/** BASE の全部の値を delta ずつずらしたもの。delta が大きいほど別人に近い。 */
const shifted = (delta: number) => BASE.map((v) => v + delta);

const challenge = (id: LivenessChallenge["id"]) => {
  const found = LIVENESS_CHALLENGES.find((c) => c.id === id);
  if (!found) throw new Error(`指示 ${id} がありません`);
  return found;
};

describe("顔の似ている度合い", () => {
  test("同じ特徴なら 1、少し違えば高め、大きく違えば 0 になる", () => {
    // Arrange & Act
    const same = faceSimilarity(BASE, BASE);
    const close = faceSimilarity(BASE, shifted(0.001));
    const far = faceSimilarity(BASE, shifted(0.5));

    // Assert
    expect(same).toBe(1);
    expect(close).toBeGreaterThan(0.9);
    expect(far).toBe(0);
  });

  test("Human の match.similarity と同じ計算をする(距離 25 倍 → 平方根 → 0.2〜0.8 を 0〜1 に)", () => {
    // Arrange: 全部の値が 0.2 ずれている → 2 乗の和 = 1024 × 0.04 = 40.96
    // 距離 = 25 × 40.96 = 1024 → 1 - √1024 / 100 = 0.68 → (0.68 - 0.2) / (0.8 - 0.2) = 0.8
    const a = new Array(LENGTH).fill(0);
    const b = new Array(LENGTH).fill(0.2);

    // Act
    const similarity = faceSimilarity(a, b);

    // Assert
    expect(similarity).toBe(0.8);
  });

  test("形のおかしな特徴(短い・数でない・長さ違い)は似ていない扱い(0)", () => {
    // Arrange
    const broken = [[1, 2, 3], BASE.map(() => Number.NaN), BASE.slice(0, 512), null, "abc"];

    // Act & Assert
    broken.forEach((value) => expect(faceSimilarity(BASE, value)).toBe(0));
  });
});

describe("一致・不一致・顔が見つからないの判定", () => {
  test("しきい値以上なら一致、未満なら不一致", () => {
    // Arrange
    const sameish = shifted(0.001);
    const other = shifted(0.5);

    // Act
    const match = judgeFaceMatch(BASE, sameish);
    const mismatch = judgeFaceMatch(BASE, other);

    // Assert
    expect(match.kind).toBe("match");
    expect(match.similarity).toBeGreaterThanOrEqual(FACE_MATCH_THRESHOLD);
    expect(mismatch.kind).toBe("mismatch");
    expect(mismatch.similarity).toBeLessThan(FACE_MATCH_THRESHOLD);
  });

  test("しきい値ちょうどは一致に入る", () => {
    // Arrange: 0.2 ずらすと似ている度合いがちょうど 0.8 になる
    const a = new Array(LENGTH).fill(0);
    const b = new Array(LENGTH).fill(0.2);

    // Act & Assert
    expect(judgeFaceMatch(a, b, 0.8).kind).toBe("match");
    expect(judgeFaceMatch(a, b, 0.81).kind).toBe("mismatch");
  });

  test("顔が見つからなければ、どちらで見つからなかったかを返す", () => {
    // Arrange & Act
    const noId = judgeFaceMatch(null, BASE);
    const noSelfie = judgeFaceMatch(BASE, null);

    // Assert
    expect(noId).toEqual({ kind: "no-face", where: "id", similarity: 0 });
    expect(noSelfie).toEqual({ kind: "no-face", where: "selfie", similarity: 0 });
  });

  test("結果ごとに、やさしい日本語の説明を返す", () => {
    // Arrange & Act
    const messages = [
      describeMatch(judgeFaceMatch(BASE, BASE)),
      describeMatch(judgeFaceMatch(BASE, shifted(0.5))),
      describeMatch(judgeFaceMatch(null, BASE)),
      describeMatch(judgeFaceMatch(BASE, null)),
    ];

    // Assert
    expect(messages[0]).toContain("確認できました");
    expect(messages[1]).toContain("もう一度");
    expect(messages[2]).toContain("身分証");
    expect(messages[3]).toContain("自撮り");
    expect(new Set(messages).size).toBe(4);
  });
});

describe("生きた本人かの確認の指示", () => {
  test("指示は重ならずに 2 つ選ばれる", () => {
    // Arrange
    const randoms = [0, 0.3, 0.6, 0.99];

    // Act
    const results = randoms.flatMap((a) => randoms.map((b) => {
      const values = [a, b];
      let i = 0;
      return pickChallenges(() => values[i++ % values.length]);
    }));

    // Assert
    results.forEach((picked) => {
      expect(picked).toHaveLength(2);
      expect(new Set(picked.map((c) => c.id)).size).toBe(2);
    });
  });

  test("「左を向いて」と「右を向いて」は同時に選ばない", () => {
    // Arrange: 1 つ目に turn-left(番号 1)、残り 3 つから turn-right(番号 1)を選ぶ数
    const values = [0.3, 0.4];
    let i = 0;

    // Act
    const picked = pickChallenges(() => values[i++]);

    // Assert
    const ids = picked.map((c) => c.id);
    expect(ids).toContain("turn-left");
    expect(ids).not.toContain("turn-right");
    expect(ids).toHaveLength(2);
  });

  test("しぐさの名前から、指示どおりにできたかを判定する", () => {
    // Arrange & Act & Assert
    expect(isChallengeMet(challenge("blink"), ["facing center", "blink left eye"])).toBe(true);
    expect(isChallengeMet(challenge("blink"), ["facing center"])).toBe(false);
    expect(isChallengeMet(challenge("turn-left"), ["facing left"])).toBe(true);
    expect(isChallengeMet(challenge("turn-left"), ["facing right"])).toBe(false);
    expect(isChallengeMet(challenge("turn-right"), ["facing right"])).toBe(true);
    expect(isChallengeMet(challenge("open-mouth"), ["mouth 45% open"])).toBe(true);
    expect(isChallengeMet(challenge("open-mouth"), ["mouth 12% open"])).toBe(false);
  });

  test(`しぐさが ${CHALLENGE_FRAMES_REQUIRED} 回続けて見えたら次の指示へ進み、途切れたら数え直す`, () => {
    // Arrange
    const challenges = [challenge("blink"), challenge("turn-left")];
    const start = { index: 0, streak: 0 };

    // Act
    const once = advanceChallenge(start, challenges, ["blink left eye"]);
    const broken = advanceChallenge(once, challenges, ["facing center"]);
    const twice = advanceChallenge(once, challenges, ["blink right eye"]);
    const second = advanceChallenge(advanceChallenge(twice, challenges, ["facing left"]), challenges, [
      "facing left",
    ]);

    // Assert
    expect(once).toEqual({ index: 0, streak: 1 });
    expect(broken).toEqual({ index: 0, streak: 0 });
    expect(twice).toEqual({ index: 1, streak: 0 });
    expect(areChallengesDone(twice, challenges)).toBe(false);
    expect(second).toEqual({ index: 2, streak: 0 });
    expect(areChallengesDone(second, challenges)).toBe(true);
    expect(start).toEqual({ index: 0, streak: 0 }); // 元のオブジェクトは変えない
  });
});

describe("そのほか", () => {
  test("いちばん大きく写っている顔を選ぶ。顔がなければ null", () => {
    // Arrange
    const small = { box: [0, 0, 10, 10] as const, name: "小" };
    const large = { box: [5, 5, 80, 90] as const, name: "大" };

    // Act & Assert
    expect(pickLargestFace([small, large])?.name).toBe("大");
    expect(pickLargestFace([])).toBeNull();
  });

  test("サーバーへ送る中身は userId・方式・ライブネスだけ", () => {
    // Arrange
    const userId = `U${"a".repeat(32)}`;

    // Act
    const payload = buildVerifyPayload(userId, true);
    const noLiveness = buildVerifyPayload(userId, false);

    // Assert
    expect(payload).toEqual({ userId, method: "face-match-demo", liveness: true });
    expect(Object.keys(payload).sort()).toEqual(["liveness", "method", "userId"]);
    expect(noLiveness.liveness).toBe(false);
  });
});
