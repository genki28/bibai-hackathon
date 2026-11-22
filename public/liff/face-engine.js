// 顔認識のライブラリ Human(https://github.com/vladmandic/human, MIT ライセンス)を使う部分。
// ライブラリとモデル(顔の検出・特徴点・顔の特徴の数値を出す AI)は CDN から読み込み、
// 計算はすべてこのスマホの中で行う。画像や顔の特徴の数値をサーバーへ送ることはしない。
// ⚠ バージョンを固定している。上げるときは README と dist/・models/ の中身を確かめてから。

const HUMAN_VERSION = "3.3.6";
const HUMAN_BASE_URL = `https://cdn.jsdelivr.net/npm/@vladmandic/human@${HUMAN_VERSION}`;
/** ブラウザ用の ESM 版(TensorFlow.js も入っている)。 */
export const HUMAN_MODULE_URL = `${HUMAN_BASE_URL}/dist/human.esm.js`;
/** モデルの置き場所(blazeface・facemesh・faceres を使う)。 */
export const HUMAN_MODEL_BASE_URL = `${HUMAN_BASE_URL}/models/`;

/** 写真を調べる前に縮める大きさ(長いほうの辺の px)。大きすぎると遅く、小さすぎると身分証の顔が小さくなる。 */
const MAX_IMAGE_SIDE = 1280;

/**
 * Human の設定。使うのは顔の検出・特徴点(まばたき・向き)・顔の特徴の数値だけ。
 * 前の結果を使い回す仕組み(キャッシュ)は切る(身分証と自撮りの結果が混ざらないように)。
 */
const HUMAN_CONFIG = {
  modelBasePath: HUMAN_MODEL_BASE_URL,
  backend: "webgl",
  debug: false,
  cacheSensitivity: 0,
  warmup: "none",
  filter: { enabled: true, equalization: true },
  gesture: { enabled: true },
  face: {
    enabled: true,
    detector: { rotation: true, maxDetected: 3, skipFrames: 0, skipTime: 0, return: false },
    mesh: { enabled: true },
    iris: { enabled: false },
    emotion: { enabled: false },
    description: { enabled: true, skipFrames: 0, skipTime: 0 },
    antispoof: { enabled: false },
    liveness: { enabled: false },
  },
  body: { enabled: false },
  hand: { enabled: false },
  object: { enabled: false },
  segmentation: { enabled: false },
};

/** 映像を見ている間は顔の特徴の数値を出さない(軽くするため)。 */
const VIDEO_CONFIG = { face: { description: { enabled: false } } };
/** 写真や最後の 1 枚では、顔の特徴の数値も出す。 */
const STILL_CONFIG = { face: { description: { enabled: true } } };

let humanPromise = null;

async function createHuman() {
  const { Human } = await import(HUMAN_MODULE_URL);
  const human = new Human(HUMAN_CONFIG);
  await human.load();
  return human;
}

/** Human とモデルを読み込む(1 回だけ)。失敗したら、次に呼んだときにやり直す。 */
export function loadFaceEngine() {
  humanPromise ??= createHuman().catch((error) => {
    humanPromise = null;
    throw error;
  });
  return humanPromise;
}

/** カメラ(getUserMedia)の映像が使えそうか。 */
export const canUseCamera = () =>
  typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function";

/** 画像ファイルを、縮めた canvas に描く。使い終わったら eraseCanvas() で消すこと。 */
async function fileToCanvas(file) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    image.src = "";
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** canvas の中身を消して、小さくする(画像を残さないため)。 */
export function eraseCanvas(canvas) {
  if (!canvas) return;
  canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
  canvas.width = 0;
  canvas.height = 0;
}

/** Human の結果から、顔ごとの { box, embedding } だけを取り出す。 */
const toFaces = (result) =>
  (result?.face ?? []).map((face) => ({
    box: face.box,
    embedding: face.embedding && face.embedding.length > 0 ? Array.from(face.embedding) : null,
  }));

/** Human の結果から、しぐさの名前の一覧を取り出す。 */
const toGestures = (result) =>
  (result?.gesture ?? []).filter((g) => "face" in g).map((g) => g.gesture);

/**
 * 画像ファイル(身分証 / 自撮り)から顔を探す。
 * @returns {Promise<Array<{ box: number[], embedding: number[] | null }>>}
 */
export async function detectFacesInFile(file) {
  const human = await loadFaceEngine();
  const canvas = await fileToCanvas(file);
  try {
    return toFaces(await human.detect(canvas, STILL_CONFIG));
  } finally {
    eraseCanvas(canvas);
  }
}

/** 前のカメラを開いて video に映す。止めるときは stopCamera(video)。 */
export async function startFrontCamera(video) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
  });
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();
  return stream;
}

/** カメラを止めて、映像を外す。 */
export function stopCamera(video) {
  const stream = video?.srcObject;
  if (stream && typeof stream.getTracks === "function") {
    stream.getTracks().forEach((track) => track.stop());
  }
  if (video) video.srcObject = null;
}

/** 映像の今の 1 コマのしぐさと顔の数。 */
export async function detectVideoFrame(video) {
  const human = await loadFaceEngine();
  const result = await human.detect(video, VIDEO_CONFIG);
  return { faceCount: result?.face?.length ?? 0, gestures: toGestures(result) };
}

/** 映像の今の 1 コマから、顔の特徴の数値も含めて顔を探す。 */
export async function detectVideoFaces(video) {
  const human = await loadFaceEngine();
  const result = await human.detect(video, STILL_CONFIG);
  return { faces: toFaces(result), gestures: toGestures(result) };
}
