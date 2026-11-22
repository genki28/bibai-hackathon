// 顔の照合(デモ)の計算だけを集めたもの(純粋関数)。画面(identity.js)からもテストからも使う。
// 顔認識のライブラリ(Human)には頼らない。ライブラリが出した「顔の特徴の数値(埋め込みベクトル)」や
// 「しぐさ(まばたき・顔の向き)」を受け取って、判定だけをする。

/**
 * 同じ人とみなす「似ている度合い」の下限(0〜1)。
 * Human の作者の顔照合のデモ(faceid)と同じ 0.5。身分証の小さな写真と自撮りは写り方が違うので、
 * 本番の eKYC よりかなりゆるい判定だと考えること。
 */
export const FACE_MATCH_THRESHOLD = 0.5;

/**
 * 似ている度合いの計算のしかた。Human の faceres モデル用の値(作者のデモと同じ)。
 * order 2 = ふつうの距離(ユークリッド距離)。距離を multiplier 倍し、min〜max の範囲を 0〜1 に直す。
 */
export const MATCH_OPTIONS = Object.freeze({ order: 2, multiplier: 25, min: 0.2, max: 0.8 });

/** 顔の特徴の数値として最低限ほしい長さ(Human の faceres は 1024 個)。 */
const MIN_EMBEDDING_LENGTH = 64;

/** 生きた本人かを確かめる指示。gestures は Human が返すしぐさの名前(どれか 1 つが出れば OK)。 */
export const LIVENESS_CHALLENGES = Object.freeze([
  Object.freeze({ id: "blink", label: "まばたきしてください", gestures: ["blink left eye", "blink right eye"] }),
  Object.freeze({ id: "turn-left", label: "顔を少し左に向けてください", gestures: ["facing left"] }),
  Object.freeze({ id: "turn-right", label: "顔を少し右に向けてください", gestures: ["facing right"] }),
  Object.freeze({ id: "open-mouth", label: "口を大きく開けてください", gestures: [] }),
]);

/** 口を開けたとみなす開き具合(%)。Human は「mouth 〇% open」というしぐさを返す。 */
export const MOUTH_OPEN_PERCENT = 30;
/** 指示どおりのしぐさが、続けて何回の映像で見えたらできたとみなすか(たまたまの誤判定を減らす)。 */
export const CHALLENGE_FRAMES_REQUIRED = 2;

/** 正しい形の顔の特徴の数値か。 */
export function isEmbedding(value) {
  return (
    Array.isArray(value) &&
    value.length >= MIN_EMBEDDING_LENGTH &&
    value.every((n) => typeof n === "number" && Number.isFinite(n))
  );
}

/**
 * 2 つの顔の特徴の数値の、似ている度合い(0 = 似ていない 〜 1 = そっくり)。
 * Human の match.similarity と同じ計算(距離の 2 乗の和 × multiplier → 平方根 → min〜max を 0〜1 に)。
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 */
export function faceSimilarity(a, b, options = MATCH_OPTIONS) {
  if (!isEmbedding(a) || !isEmbedding(b) || a.length !== b.length) return 0;
  const sumOfSquares = a.reduce((sum, value, i) => sum + (value - b[i]) ** 2, 0);
  const distance = Math.round(100 * options.multiplier * sumOfSquares) / 100;
  if (distance === 0) return 1;
  const normalized = (1 - Math.sqrt(distance) / 100 - options.min) / (options.max - options.min);
  return Math.round(100 * Math.min(Math.max(normalized, 0), 1)) / 100;
}

/**
 * 身分証の顔と自撮りの顔を比べた結果。
 * - kind: "match"(一致)/ "mismatch"(不一致)/ "no-face"(顔が見つからない)
 * - where: 顔が見つからなかったのはどちらか("id" = 身分証 / "selfie" = 自撮り)。見つかったときは null
 * @param {number[] | null} idEmbedding 身分証の顔の特徴(見つからなければ null)
 * @param {number[] | null} selfieEmbedding 自撮りの顔の特徴(見つからなければ null)
 */
export function judgeFaceMatch(idEmbedding, selfieEmbedding, threshold = FACE_MATCH_THRESHOLD) {
  if (!isEmbedding(idEmbedding)) return { kind: "no-face", where: "id", similarity: 0 };
  if (!isEmbedding(selfieEmbedding)) return { kind: "no-face", where: "selfie", similarity: 0 };
  const similarity = faceSimilarity(idEmbedding, selfieEmbedding);
  return { kind: similarity >= threshold ? "match" : "mismatch", where: null, similarity };
}

/** 判定の結果を、やさしい日本語にする。 */
export function describeMatch(result) {
  if (result.kind === "match") return "身分証の写真と同じ人だと確認できました。";
  if (result.kind === "mismatch") {
    return "身分証の写真と同じ人だと確認できませんでした。明るい場所で、顔がはっきり写るようにもう一度ためしてください。";
  }
  if (result.where === "id") {
    return "身分証の写真から顔が見つかりませんでした。顔写真の面を、画面いっぱいに、光が反射しないように撮ってください。";
  }
  return "自撮りから顔が見つかりませんでした。明るい場所で、顔が画面の真ん中に来るようにしてください。";
}

/**
 * 指示をランダムに count 個、重ならないように選ぶ。
 * @param {() => number} random 0 以上 1 未満の数を返す関数(テストでは決まった値を返すものを渡す)
 */
export function pickChallenges(random = Math.random, count = 2) {
  const pool = [...LIVENESS_CHALLENGES];
  const picked = [];
  while (picked.length < count && pool.length > 0) {
    const index = Math.min(Math.floor(random() * pool.length), pool.length - 1);
    picked.push(pool[index]);
    pool.splice(index, 1);
  }
  // 「左を向いて」と「右を向いて」は続けると分かりにくいので、両方は選ばない
  const ids = picked.map((c) => c.id);
  if (ids.includes("turn-left") && ids.includes("turn-right")) {
    return [picked[0], LIVENESS_CHALLENGES.find((c) => c.id === "blink")];
  }
  return picked;
}

/** その映像で、指示どおりのしぐさが見えたか。 */
export function isChallengeMet(challenge, gestures) {
  if (challenge.id === "open-mouth") {
    return gestures.some((g) => {
      const match = /^mouth (\d+)% open$/.exec(g);
      return match !== null && Number(match[1]) >= MOUTH_OPEN_PERCENT;
    });
  }
  return gestures.some((g) => challenge.gestures.includes(g));
}

/**
 * 1 回分の映像の結果を受けて、指示の進み具合を更新する(新しいオブジェクトを返す)。
 * progress = { index: 今の指示の番号, streak: 続けて見えた回数 }
 */
export function advanceChallenge(progress, challenges, gestures) {
  const current = challenges[progress.index];
  if (!current) return progress;
  if (!isChallengeMet(current, gestures)) return { ...progress, streak: 0 };
  const streak = progress.streak + 1;
  if (streak < CHALLENGE_FRAMES_REQUIRED) return { ...progress, streak };
  return { index: progress.index + 1, streak: 0 };
}

/** 全部の指示が終わったか。 */
export const areChallengesDone = (progress, challenges) => progress.index >= challenges.length;

/**
 * いちばん大きく写っている顔を選ぶ(身分証には小さな顔や模様が写ることがあるため)。
 * @param {ReadonlyArray<{ box: [number, number, number, number] }>} faces
 */
export function pickLargestFace(faces) {
  return faces.reduce(
    (largest, face) => (largest === null || face.box[2] * face.box[3] > largest.box[2] * largest.box[3] ? face : largest),
    null,
  );
}

/** サーバーへ送る中身。画像・顔の特徴の数値は入れない。 */
export const buildVerifyPayload = (userId, liveness) => ({
  userId,
  method: "face-match-demo",
  liveness: liveness === true,
});
