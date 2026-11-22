// 【試作】雪スキャンの画面の動き(snow-scan.html)。
// 写真を選ぶ → 小さくして Canvas に描く → 雪の部分を見つけて水色で重ねる → 奥行きの AI で奥行きの絵を描く
// → 前と後の雪の割合から除雪率を出す(遠近補正あり / なし)。奥行きの AI が使えなくても、補正なしの値は出す。
// 注意: 画面に文字を入れるときは必ず textContent を使う(innerHTML は使わない)。

import { byId } from "./common.js";
import { loadDepthModel } from "./depth-model.js";
import { pageReady } from "./loading.js";
import { NOT_GROUND, clearanceRate, footprintWeights, snowCoverage, snowMaskOf } from "./snow-scan-core.js";

/** 計算に使う写真の長い辺(ドット)。大きいと遅くなる。 */
const MAX_SIDE = 384;
/** 雪の部分に重ねる色と濃さ、地面の外を暗くする濃さ。 */
const SNOW_TINT = [79, 209, 255];
const SNOW_ALPHA = 0.55;
const OUTSIDE_DIM = 0.45;
/** 奥行きの色(遠い → 近い)。 */
const FAR_COLOR = [59, 42, 143];
const NEAR_COLOR = [255, 201, 77];

/** 前と後のそれぞれの結果。 */
const shots = { before: null, after: null };
let modelPromise = null;

const percent = (ratio) => `${Math.round(ratio * 100)}%`;

function showError(message) {
  const error = byId("error");
  error.textContent = message;
  error.hidden = message === "";
}

/** 写真のファイルを読み込んで、長い辺を MAX_SIDE にした Canvas に描く。 */
async function drawPhoto(file, canvas) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/** 写真の上に、雪の部分を水色で重ね、地面の外を暗くする。 */
function paintMask(canvas, image, mask) {
  const out = new ImageData(new Uint8ClampedArray(image.data), image.width, image.height);
  for (let i = 0; i < mask.length; i += 1) {
    const p = i * 4;
    if (mask[i] === NOT_GROUND) {
      for (let c = 0; c < 3; c += 1) out.data[p + c] = image.data[p + c] * OUTSIDE_DIM;
    } else if (mask[i] === 1) {
      for (let c = 0; c < 3; c += 1) out.data[p + c] = image.data[p + c] * (1 - SNOW_ALPHA) + SNOW_TINT[c] * SNOW_ALPHA;
    }
  }
  canvas.getContext("2d").putImageData(out, 0, 0);
}

/** 奥行き(0〜255、近いほど大きい)を、遠い = 紫 → 近い = 黄色で描く。 */
function paintDepth(canvas, depth) {
  canvas.width = depth.width;
  canvas.height = depth.height;
  const out = new ImageData(depth.width, depth.height);
  for (let i = 0; i < depth.data.length; i += 1) {
    const t = depth.data[i] / 255;
    for (let c = 0; c < 3; c += 1) out.data[i * 4 + c] = FAR_COLOR[c] + (NEAR_COLOR[c] - FAR_COLOR[c]) * t;
    out.data[i * 4 + 3] = 255;
  }
  canvas.getContext("2d").putImageData(out, 0, 0);
}

/** 奥行きの AI を(はじめの 1 回だけ)読み込む。 */
function depthModel() {
  modelPromise ??= loadDepthModel((text) => {
    byId("model-status").textContent = text;
  }).then((model) => {
    byId("model-status").textContent = `奥行きの AI: ${model.backend}(準備 ${(model.loadMs / 1000).toFixed(1)} 秒)`;
    return model;
  });
  return modelPromise;
}

/** 前と後がそろったら、除雪率を出す。 */
function showResult() {
  const { before, after } = shots;
  if (!before || !after) return;
  const weighted = before.weighted !== null && after.weighted !== null;
  const rate = weighted ? clearanceRate(before.weighted, after.weighted) : clearanceRate(before.flat, after.flat);
  byId("clear-rate").textContent = percent(rate);
  byId("clear-rate-flat").textContent = weighted
    ? `遠近補正なし: ${percent(clearanceRate(before.flat, after.flat))}`
    : "奥行きの AI が使えないため、遠近補正なしの値です";
}

function showCoverage(key) {
  const shot = shots[key];
  const weighted = shot.weighted === null ? "" : `(補正後 ${percent(shot.weighted)})`;
  byId(`${key}-coverage`).textContent = `雪 ${percent(shot.flat)}${weighted}`;
}

/** 1 枚の写真を調べる。 */
async function scan(key, file) {
  showError("");
  const photo = byId(`${key}-photo`);
  const image = await drawPhoto(file, photo);
  const mask = snowMaskOf(image);
  paintMask(photo, image, mask);
  shots[key] = { flat: snowCoverage(mask), weighted: null };
  showCoverage(key);
  showResult();
  try {
    const model = await depthModel();
    byId("model-status").textContent = "奥行きを推定中…";
    const depth = await model.estimate(copyOf(image));
    paintDepth(byId(`${key}-depth`), depth);
    shots[key] = { ...shots[key], weighted: snowCoverage(mask, footprintWeights(depth.data, mask)) };
    byId("model-status").textContent = `奥行きの AI: ${model.backend}(推定 ${Math.round(depth.ms)} ミリ秒)`;
    showCoverage(key);
    showResult();
  } catch (error) {
    console.error(error);
    byId("model-status").textContent = "奥行きの AI が使えませんでした(遠近補正なしで計算します)";
  }
}

/** 雪の印を重ねる前の写真を、AI に渡す用の Canvas に写す。 */
function copyOf(image) {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.getContext("2d").putImageData(image, 0, 0);
  return canvas;
}

["before", "after"].forEach((key) => {
  byId(`${key}-input`).addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    scan(key, file).catch((error) => {
      console.error(error);
      showError(`写真を読み込めませんでした: ${error.message}`);
    });
  });
});

pageReady();
