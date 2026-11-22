// 雪かき中のドット絵(pixel-snow.js)の「動かない背景」を描く。最初に 1 回だけ描いて使い回す(毎回描かないので軽い)。
// - 空: 夜空の色を段々に、境目はドットを市松模様にまぜる(ドット絵らしいグラデーション)。月と星
// - 前景: 遠くの山、美唄の町の小さな家、街灯、お年寄りの家(玄関つき)、雪の地面
// 画像ファイルは使わず、fillRect で 1 ドットずつ描く。

import { createRandom } from "./pixel-game.js";

export const SCENE_WIDTH = 160;
export const SCENE_HEIGHT = 120;
/** 地面の高さ(この行から下が雪の地面)。 */
export const GROUND_Y = 98;

/** お年寄りの家の玄関の位置(雪の山はこの前に積もる)。 */
const DOOR = Object.freeze({ x: 118, width: 8, height: 12 });

const SKY_BANDS = ["#0b1026", "#101734", "#151f45", "#1b2a5c"];
const STAR_COUNT = 34;
const STAR_SEED = 2024;
const MOUNTAIN_SEED = 7;

const COLORS = Object.freeze({
  moon: "#fffbe6",
  moonShade: "#e9dfb8",
  star: "#dfe9ff",
  farRidge: "#24306a",
  nearRidge: "#1a2452",
  ridgeSnow: "#9fb2dc",
  wall: "#2e2748",
  wallShade: "#241e3a",
  roofSnow: "#eef4ff",
  roofShade: "#b9c8e8",
  window: "#ffc94d",
  windowGlow: "#7a5f2a",
  door: "#6b4a35",
  knob: "#ffc94d",
  pole: "#5b6690",
  lamp: "#fff3c4",
  ground: "#e6eefc",
  groundTop: "#ffffff",
  groundShade: "#c5d3ee",
  lampLight: "#fff1c2",
});

const rect = (ctx, color, x, y, w, h) => {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
};

/** 決まった大きさのキャンバスを作る(画面には出さない、描きためる用)。 */
export function createLayer(width = SCENE_WIDTH, height = SCENE_HEIGHT) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}

function drawSkyBands(ctx) {
  const bandHeight = Math.ceil(GROUND_Y / SKY_BANDS.length);
  for (let y = 0; y < GROUND_Y; y += 1) {
    const band = Math.min(SKY_BANDS.length - 1, Math.floor(y / bandHeight));
    rect(ctx, SKY_BANDS[band], 0, y, SCENE_WIDTH, 1);
    // 次の色との境目の 2 行は、市松模様に次の色をまぜる
    const isEdge = y % bandHeight >= bandHeight - 2 && band < SKY_BANDS.length - 1;
    if (!isEdge) continue;
    for (let x = (y % 2); x < SCENE_WIDTH; x += 2) rect(ctx, SKY_BANDS[band + 1], x, y, 1, 1);
  }
}

function drawMoon(ctx) {
  const cx = 138;
  const cy = 14;
  const radius = 6;
  for (let dy = -radius; dy <= radius; dy += 1) {
    const half = Math.round(Math.sqrt(radius * radius - dy * dy));
    rect(ctx, COLORS.moon, cx - half, cy + dy, half * 2 + 1, 1);
  }
  rect(ctx, COLORS.moonShade, cx + 1, cy - 2, 2, 2);
  rect(ctx, COLORS.moonShade, cx - 3, cy + 2, 2, 1);
}

function drawStars(ctx) {
  const random = createRandom(STAR_SEED);
  for (let i = 0; i < STAR_COUNT; i += 1) {
    const x = Math.floor(random() * SCENE_WIDTH);
    const y = Math.floor(random() * 56);
    ctx.globalAlpha = 0.4 + random() * 0.6;
    rect(ctx, COLORS.star, x, y, 1, 1);
  }
  ctx.globalAlpha = 1;
}

/** 夜空の層(月と星まで)。 */
export function drawSkyLayer() {
  const layer = createLayer();
  drawSkyBands(layer.ctx);
  drawStars(layer.ctx);
  drawMoon(layer.ctx);
  return layer.canvas;
}

function drawRidge(ctx, { base, amplitude, color, seed }) {
  const random = createRandom(seed);
  const phaseA = random() * 6;
  const phaseB = random() * 6;
  for (let x = 0; x < SCENE_WIDTH; x += 1) {
    const top = Math.round(
      base + amplitude * Math.sin(x * 0.045 + phaseA) + (amplitude / 2) * Math.sin(x * 0.12 + phaseB),
    );
    rect(ctx, color, x, top, 1, GROUND_Y - top);
    rect(ctx, COLORS.ridgeSnow, x, top, 1, 1);
  }
}

/** 雪の積もった三角の屋根(左が明るく、右が少し影)。 */
function drawRoof(ctx, x, top, width, height) {
  const center = x + width / 2;
  for (let row = 0; row < height; row += 1) {
    const half = Math.round(((row + 1) / height) * (width / 2 + 1));
    rect(ctx, COLORS.roofSnow, Math.round(center - half), top + row, half, 1);
    rect(ctx, COLORS.roofShade, Math.round(center), top + row, half, 1);
  }
}

function drawWindow(ctx, x, y) {
  rect(ctx, COLORS.windowGlow, x - 1, y - 1, 5, 5);
  rect(ctx, COLORS.window, x, y, 3, 3);
}

function drawHouse(ctx, { x, width, wallHeight, roofHeight, windows }) {
  const wallTop = GROUND_Y - wallHeight;
  rect(ctx, COLORS.wall, x, wallTop, width, wallHeight);
  rect(ctx, COLORS.wallShade, x + width - 2, wallTop, 2, wallHeight);
  drawRoof(ctx, x - 1, wallTop - roofHeight, width + 2, roofHeight);
  windows.forEach(([wx, wy]) => drawWindow(ctx, x + wx, wallTop + wy));
}

/** 美唄の町の小さな家の並び。 */
const SMALL_HOUSES = [
  { x: 2, width: 18, wallHeight: 10, roofHeight: 7, windows: [[4, 3], [11, 3]] },
  { x: 24, width: 14, wallHeight: 8, roofHeight: 6, windows: [[5, 2]] },
  { x: 42, width: 12, wallHeight: 9, roofHeight: 6, windows: [[4, 3]] },
];

function drawElderHouse(ctx) {
  const house = { x: 108, width: 50, wallHeight: 22, roofHeight: 12, windows: [[32, 6], [40, 6]] };
  drawHouse(ctx, house);
  const doorTop = GROUND_Y - DOOR.height;
  rect(ctx, COLORS.door, DOOR.x, doorTop, DOOR.width, DOOR.height);
  rect(ctx, COLORS.knob, DOOR.x + DOOR.width - 2, doorTop + 6, 1, 1);
  rect(ctx, COLORS.roofSnow, DOOR.x - 2, doorTop - 2, DOOR.width + 4, 2); // 玄関のひさしの雪
}

function drawStreetLight(ctx, x) {
  const lampY = 70;
  // 光のにじみ(市松模様で半透明に見せる)
  ctx.globalAlpha = 0.35;
  for (let dy = -7; dy <= 7; dy += 1) {
    for (let dx = -7; dx <= 7; dx += 1) {
      if ((dx + dy) % 2 !== 0 || dx * dx + dy * dy > 49) continue;
      rect(ctx, COLORS.window, x + dx, lampY + dy, 1, 1);
    }
  }
  ctx.globalAlpha = 1;
  rect(ctx, COLORS.pole, x, lampY, 1, GROUND_Y - lampY);
  rect(ctx, COLORS.pole, x - 2, lampY - 1, 5, 1);
  rect(ctx, COLORS.lamp, x - 1, lampY, 3, 2);
}

function drawGround(ctx) {
  rect(ctx, COLORS.ground, 0, GROUND_Y, SCENE_WIDTH, SCENE_HEIGHT - GROUND_Y);
  rect(ctx, COLORS.groundTop, 0, GROUND_Y, SCENE_WIDTH, 1);
  const random = createRandom(MOUNTAIN_SEED + 1);
  for (let i = 0; i < 70; i += 1) {
    const x = Math.floor(random() * SCENE_WIDTH);
    const y = GROUND_Y + 2 + Math.floor(random() * (SCENE_HEIGHT - GROUND_Y - 2));
    rect(ctx, COLORS.groundShade, x, y, 2, 1);
  }
  // 街灯の下だけ、雪がほんのり黄色く光る
  for (let dx = -6; dx <= 6; dx += 2) rect(ctx, COLORS.lampLight, 62 + dx, GROUND_Y + 1, 1, 1);
}

/** 前景の層(山・家・街灯・地面)。透明なところは空が見える。 */
export function drawFrontLayer() {
  const layer = createLayer();
  const { ctx } = layer;
  drawRidge(ctx, { base: 60, amplitude: 7, color: COLORS.farRidge, seed: MOUNTAIN_SEED });
  drawRidge(ctx, { base: 76, amplitude: 5, color: COLORS.nearRidge, seed: MOUNTAIN_SEED + 2 });
  SMALL_HOUSES.forEach((house) => drawHouse(ctx, house));
  drawStreetLight(ctx, 62);
  drawElderHouse(ctx);
  drawGround(ctx);
  return layer.canvas;
}
