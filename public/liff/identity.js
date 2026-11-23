// 本人確認(デモ)の画面の動き: 身分証の顔写真と、その場の自撮りを、このスマホの中だけで照合する。
// 流れ: 同意 → 顔の照合の準備 → 身分証の表面を撮る → 生きた本人かの確認(まばたき・顔の向き)→ 照合 → 完了
// ⚠ 画像・映像・顔の特徴の数値はサーバーへ送らない。使い終わったらすぐ消す。送るのは結果だけ。
// ⚠ 身分証が本物かどうかは確かめていない。判定もスマホの中なので、ごまかそうと思えばごまかせる(デモ)。
// 注意: 画面に文字を入れるときは必ず textContent を使う(innerHTML は使わない)。

import { byId, callApi, fetchAppConfig, postJson, resolveUserId, wait } from "./common.js";
import {
  advanceChallenge,
  areChallengesDone,
  buildVerifyPayload,
  describeMatch,
  isEmbedding,
  judgeFaceMatch,
  pickChallenges,
  pickLargestFace,
} from "./face-check.js";
import {
  canUseCamera,
  detectFacesInFile,
  detectVideoFaces,
  detectVideoFrame,
  loadFaceEngine,
  startFrontCamera,
  stopCamera,
} from "./face-engine.js";
import { navigateTo, pageReady } from "./loading.js";
import "./reset-menu-button.js";
import "./test-mode.js";

const STEPS = [
  "loading",
  "intro",
  "preparing",
  "unavailable",
  "id",
  "liveness",
  "selfie",
  "checking",
  "failed",
  "done",
];
/** 本人確認ができてから、次の画面へ自動で進むまでの時間。 */
const AUTO_NEXT_DELAY_MS = 1500;
/** 生きた本人かの確認にかけてよい時間。過ぎたらやり直してもらう。 */
const LIVENESS_TIMEOUT_MS = 40_000;
/** 指示が 1 つできたとき、次の指示を出すまでの間。 */
const CHALLENGE_PAUSE_MS = 600;
const REQUEST_ID_PATTERN = /^[0-9a-f-]{36}$/;

const METHOD_LABELS = {
  "face-match-demo": "顔の照合",
  "mynumber-card-mock": "予備のデモボタン(何も確かめていません)",
};

/** 身分証の顔の特徴の数値。照合が終わったら(成功でも失敗でも)すぐ消す。 */
let idEmbedding = null;
/** 今のカメラの確認の番号。やめたり画面を離れたりしたら増やして、動いている確認を止める。 */
let livenessSession = 0;

function showStep(name) {
  STEPS.forEach((step) => {
    byId(`step-${step}`).hidden = step !== name;
  });
}

function showError(message) {
  const error = byId("error");
  error.textContent = message;
  error.hidden = message === "";
}

const errorMessage = (error) => (error instanceof Error ? error.message : String(error));

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

/** 画像・映像・顔の特徴の数値を手元から消す。 */
function clearSecrets() {
  livenessSession += 1;
  idEmbedding = null;
  stopCamera(byId("camera-video"));
  byId("id-photo-input").value = "";
  byId("selfie-photo-input").value = "";
}

const fetchStatus = (userId) => callApi(`/api/identity/${userId}`);

/**
 * ?next=〇〇.html で次の画面が指定されていれば返す(同じフォルダの .html だけ許す)。
 * ?id=(依頼 ID)が付いていれば、次の画面にも引き継ぐ。
 */
function nextPage() {
  const params = new URLSearchParams(location.search);
  const next = params.get("next") ?? "";
  if (!/^[a-z0-9-]+\.html$/.test(next)) return null;
  const id = params.get("id") ?? "";
  return REQUEST_ID_PATTERN.test(id) ? `./${next}?id=${id}` : `./${next}`;
}

function describeMethod(status) {
  const label = METHOD_LABELS[status.method] ?? "";
  if (status.method !== "face-match-demo") return label;
  return `${label}・生きた本人かの確認: ${status.liveness ? "あり" : "なし"}`;
}

function showDone(status) {
  const date = new Date(status.verifiedAt);
  byId("verified-at").textContent = `確認日時: ${date.toLocaleString("ja-JP")}`;
  byId("verified-method").textContent = describeMethod(status);
  const next = nextPage();
  byId("next-button").hidden = next === null;
  byId("auto-next-note").hidden = next === null;
  showStep("done");
  // 次の画面が決まっていれば、少し待ってから自動で進む
  if (next) setTimeout(() => navigateTo(next), AUTO_NEXT_DELAY_MS);
}

function showFailed(title, message) {
  clearSecrets();
  byId("failed-title").textContent = title;
  byId("failed-message").textContent = message;
  showStep("failed");
}

function showChecking(text) {
  byId("checking-text").textContent = text;
  showStep("checking");
}

/** 1. 同意したら、顔の照合の準備(ライブラリとモデルの読み込み)。 */
async function prepare() {
  showError("");
  showStep("preparing");
  try {
    await loadFaceEngine();
    showStep("id");
  } catch (error) {
    console.error(error);
    showStep("unavailable");
  }
}

/** 2. 身分証の写真から顔を探す。 */
async function handleIdPhoto(userId, file) {
  showError("");
  showChecking("身分証の顔写真を探しています…");
  try {
    const face = pickLargestFace(await detectFacesInFile(file));
    byId("id-photo-input").value = "";
    idEmbedding = face?.embedding ?? null;
    if (!isEmbedding(idEmbedding)) {
      showFailed("顔が見つかりませんでした", describeMatch(judgeFaceMatch(null, null)));
      return;
    }
    await startSelfie(userId);
  } catch (error) {
    console.error(error);
    showFailed("うまく調べられませんでした", `もう一度ためしてください(${errorMessage(error)})`);
  }
}

/** 3. 自撮り。カメラ映像が使えればライブネス確認、使えなければ写真 1 枚。 */
async function startSelfie(userId) {
  if (!canUseCamera()) {
    showStep("selfie");
    return;
  }
  const video = byId("camera-video");
  try {
    await startFrontCamera(video);
  } catch (error) {
    console.error(error);
    stopCamera(video);
    showStep("selfie");
    return;
  }
  showStep("liveness");
  await runLiveness(userId, video);
}

function showChallenge(challenges, progress) {
  const current = challenges[progress.index];
  byId("challenge-count").textContent = `指示 ${progress.index + 1} / ${challenges.length}`;
  byId("challenge-text").textContent = current ? current.label : "";
}

function showCameraHint(faceCount) {
  const hint =
    faceCount === 0
      ? "顔が映っていません。顔を丸の中に入れてください"
      : faceCount > 1
        ? "映るのは 1 人だけにしてください"
        : "その調子です";
  byId("camera-hint").textContent = hint;
}

/** まばたき・顔の向きなどの指示を 2 つ出して、できたかを映像から確かめる。 */
async function runLiveness(userId, video) {
  livenessSession += 1;
  const session = livenessSession;
  const isActive = () => session === livenessSession;
  const deadline = Date.now() + LIVENESS_TIMEOUT_MS;
  const challenges = pickChallenges();
  let progress = { index: 0, streak: 0 };
  showChallenge(challenges, progress);

  try {
    while (isActive() && !areChallengesDone(progress, challenges)) {
      if (Date.now() > deadline) return timeOut();
      const frame = await detectVideoFrame(video);
      if (!isActive()) return;
      showCameraHint(frame.faceCount);
      if (frame.faceCount === 1) {
        const before = progress.index;
        progress = advanceChallenge(progress, challenges, frame.gestures);
        if (progress.index !== before) {
          byId("challenge-text").textContent = "OK!";
          await wait(CHALLENGE_PAUSE_MS);
          if (progress.index < challenges.length) showChallenge(challenges, progress);
        }
      }
      await nextFrame();
    }
    if (!isActive()) return;
    const selfieEmbedding = await captureFrontFace(video, isActive, deadline);
    if (selfieEmbedding === undefined) return; // やめた・時間切れ
    await finish(userId, selfieEmbedding, true);
  } catch (error) {
    console.error(error);
    if (isActive()) showFailed("うまく調べられませんでした", `もう一度ためしてください(${errorMessage(error)})`);
  }
}

/** 指示が全部できたら、正面を向いた顔を 1 コマとって、顔の特徴の数値を出す。 */
async function captureFrontFace(video, isActive, deadline) {
  byId("challenge-count").textContent = "さいごに";
  byId("challenge-text").textContent = "正面を向いて、そのままにしてください";
  while (isActive()) {
    if (Date.now() > deadline) {
      timeOut();
      return undefined;
    }
    const { faces, gestures } = await detectVideoFaces(video);
    if (!isActive()) return undefined;
    showCameraHint(faces.length);
    const face = faces.length === 1 ? faces[0] : null;
    if (face && isEmbedding(face.embedding) && gestures.includes("facing center")) {
      stopCamera(video);
      return face.embedding;
    }
    await nextFrame();
  }
  return undefined;
}

function timeOut() {
  showFailed(
    "時間内に確認できませんでした",
    "明るい場所で、顔を丸の中に入れて、指示どおりにゆっくり動いてください。",
  );
}

/** 3'. カメラ映像が使えないときの自撮り写真 1 枚。 */
async function handleSelfiePhoto(userId, file) {
  showError("");
  showChecking("自撮りの顔を探しています…");
  try {
    const face = pickLargestFace(await detectFacesInFile(file));
    byId("selfie-photo-input").value = "";
    await finish(userId, face?.embedding ?? null, false);
  } catch (error) {
    console.error(error);
    showFailed("うまく調べられませんでした", `もう一度ためしてください(${errorMessage(error)})`);
  }
}

/** 4〜5. 照合して、一致したら結果だけをサーバーへ送る。 */
async function finish(userId, selfieEmbedding, liveness) {
  showChecking("身分証の写真と照らし合わせています…");
  const result = judgeFaceMatch(idEmbedding, selfieEmbedding);
  clearSecrets(); // 照合が済んだら、顔の特徴の数値はもう使わない
  if (result.kind !== "match") {
    const title = result.kind === "mismatch" ? "同じ人だと確認できませんでした" : "顔が見つかりませんでした";
    showFailed(title, describeMatch(result));
    return;
  }
  try {
    showDone(await postJson("/api/identity/verify", buildVerifyPayload(userId, liveness)));
  } catch (error) {
    showFailed("結果を保存できませんでした", `もう一度ためしてください(${errorMessage(error)})`);
  }
}

/** 予備: 顔の照合が使えない端末で、何も確かめずに確認済みにする(デモ)。 */
async function demoVerify(userId) {
  showError("");
  showChecking("確認済みにしています…");
  try {
    showDone(await postJson("/api/identity/mock-verify", { userId }));
  } catch (error) {
    showStep("unavailable");
    showError(`確認済みにできませんでした: ${errorMessage(error)}`);
  }
}

/** テスト用の設定(testMode)がオンか。読めなければオフ。 */
async function isTestMode() {
  try {
    return (await fetchAppConfig()).testMode;
  } catch {
    return false;
  }
}

function startOver() {
  clearSecrets();
  showError("");
  showStep("intro");
}

function bindFileInput(id, handler) {
  byId(id).addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file) handler(file);
  });
}

async function main() {
  const userId = await resolveUserId();
  const status = await fetchStatus(userId);

  byId("agree-button").addEventListener("click", prepare);
  byId("retry-load-button").addEventListener("click", prepare);
  byId("demo-verify-button").addEventListener("click", () => demoVerify(userId));
  // デモ展示用: テストモードのときだけ、本人確認を飛ばすボタンを出す(何も確かめずに確認済みにする)
  if (await isTestMode()) {
    const skip = byId("test-skip-button");
    skip.hidden = false;
    skip.addEventListener("click", () => demoVerify(userId));
  }
  bindFileInput("id-photo-input", (file) => handleIdPhoto(userId, file));
  bindFileInput("selfie-photo-input", (file) => handleSelfiePhoto(userId, file));
  byId("liveness-cancel-button").addEventListener("click", startOver);
  byId("retry-button").addEventListener("click", () => {
    clearSecrets();
    showError("");
    showStep("id");
  });
  byId("reset-button").addEventListener("click", startOver);
  byId("next-button").addEventListener("click", () => {
    const next = nextPage();
    if (next) navigateTo(next);
  });
  // 画面を離れるときは、カメラを止めて手元のデータを消す
  window.addEventListener("pagehide", clearSecrets);

  if (status.verified) {
    showDone(status);
  } else {
    showStep("intro");
  }
}

main()
  .catch((error) => {
    console.error(error);
    showStep("intro");
    showError(`エラーが起きました: ${errorMessage(error)}`);
  })
  .finally(pageReady);
