// 雪かき中のドット絵(pixel-snow.js)で使う、描くための小さな部品(Canvas 2D)。
// 文字・降る雪・マガンの群れ・雪の山・雪の粒・文字の演出を描く。どれも「時間から位置を計算する」ので、覚えておく状態が少ない。

import { createRandom, flockSize } from "./pixel-game.js";
import { FONT, PALETTE, TRANSPARENT, textWidth, toFontText } from "./pixel-sprites.js";

export const COLORS = Object.freeze({
  // 背景の雪の地面(#b2c7fd あたり)に合わせた、白〜水色の雪の山
  pileTop: "#f4f8ff",
  pile: "#dbe5ff",
  pileShade: "#b9cbfb",
  pileEdge: "#97acec",
  flake: "#ffffff",
  flakeSmall: "#dfeaff",
  particle: "#ffffff",
  outline: "#0b1026",
  gold: "#ffc94d",
  ice: "#4fd1ff",
});

const wrap = (value, size) => ((value % size) + size) % size;

/** 画面に出さない、描きためる用のキャンバス。 */
export function createLayer(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}

/** 画像の一部を、決めた大きさで描いたキャンバスを作る(isFlipped なら左右反転)。最初に 1 回だけ作って使い回す。 */
export function bakeImage(image, { sx, sy, sw, sh }, width, height, isFlipped = false) {
  const layer = createLayer(width, height);
  if (isFlipped) {
    layer.ctx.translate(width, 0);
    layer.ctx.scale(-1, 1);
  }
  layer.ctx.drawImage(image, sx, sy, sw, sh, 0, 0, width, height);
  return layer.canvas;
}

/** 文字の並びのスプライトを、scale 倍のキャンバスにしておく。 */
export function bakeSprite(rows, scale) {
  const layer = createLayer(rows[0].length * scale, rows.length * scale);
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === TRANSPARENT) return;
      layer.ctx.fillStyle = PALETTE[ch];
      layer.ctx.fillRect(x * scale, y * scale, scale, scale);
    });
  });
  return layer.canvas;
}

/** ふちどりの向き(まわり 8 方向)と、右下の影。明るい雪の上でも読めるように。 */
const OUTLINE_OFFSETS = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1], [2, 2]];

/** ドットの文字を書く。まわりを濃い色でふちどり、右下に影を付ける。 */
export function drawText(ctx, text, x, y, { color, scale }) {
  const chars = [...toFontText(text)];
  const edge = Math.max(1, Math.floor(scale / 2));
  const paint = (fill, offsetX, offsetY) => {
    ctx.fillStyle = fill;
    chars.forEach((ch, i) => {
      FONT[ch].forEach((row, gy) => {
        [...row].forEach((dot, gx) => {
          if (dot === TRANSPARENT) return;
          ctx.fillRect(x + (i * 4 + gx) * scale + offsetX, y + gy * scale + offsetY, scale, scale);
        });
      });
    });
  };
  OUTLINE_OFFSETS.forEach(([dx, dy]) => paint(COLORS.outline, dx * edge, dy * edge));
  paint(color, 0, 0);
}

/** 文字を x を真ん中にして置いたときの左はし。 */
export const textLeft = (text, scale, centerX) => Math.round(centerX - textWidth(toFontText(text), scale) / 2);

/** 決まった並びの降る雪(位置は時間から計算するので、覚えておく必要がない)。 */
export function createSnowflakes(count, width, height) {
  const random = createRandom(11);
  return Array.from({ length: count }, () => ({
    x: random() * width,
    y: random() * height,
    speed: 12 + random() * 18,
    sway: 2 + random() * 5,
    phase: random() * Math.PI * 2,
    isBig: random() < 0.3,
  }));
}

export function drawSnowfall(ctx, flakes, seconds) {
  const { width, height } = ctx.canvas;
  flakes.forEach((flake) => {
    const x = Math.round(wrap(flake.x + Math.sin(seconds * 0.8 + flake.phase) * flake.sway - seconds * 4, width));
    const y = Math.round(wrap(flake.y + seconds * flake.speed, height + 6) - 3);
    const size = flake.isBig ? 3 : 2;
    ctx.fillStyle = flake.isBig ? COLORS.flake : COLORS.flakeSmall;
    ctx.fillRect(x, y, size, size);
  });
}

/** マガンの群れ(V の字)が来る間隔・横切る時間・最初に来るまで。 */
const FLOCK_INTERVAL_MS = 35_000;
const FLOCK_CROSS_MS = 12_000;
const FLOCK_FIRST_DELAY_MS = 3000;

/** マガンの群れ(V の字)。レベルが上がるほど仲間が増える。 */
export function drawFlock(ctx, geese, sinceStartMs, level) {
  const local = wrap(sinceStartMs - FLOCK_FIRST_DELAY_MS, FLOCK_INTERVAL_MS);
  if (local > FLOCK_CROSS_MS) return;
  const leadX = -60 + (local / FLOCK_CROSS_MS) * (ctx.canvas.width + 120);
  const leadY = 52 + 6 * Math.sin(local / 900);
  const frame = Math.floor(local / 220) % 2 === 0 ? geese.up : geese.down;
  Array.from({ length: flockSize(level) }, (_, i) => {
    const rank = Math.ceil(i / 2);
    const side = i % 2 === 0 ? 1 : -1;
    return { x: leadX - rank * 17, y: leadY + side * rank * 9 };
  }).forEach(({ x, y }) => ctx.drawImage(frame, Math.round(x), Math.round(y)));
}

/** 半円の雪の山(上のふちは白く、右側は少し影、下のはしは濃い水色)。 */
export function drawMound(ctx, centerX, baseY, { halfWidth, height }) {
  const half = Math.max(1, Math.round(halfWidth));
  for (let dx = -half; dx <= half; dx += 1) {
    const column = Math.round(height * Math.sqrt(Math.max(0, 1 - (dx / half) ** 2)));
    if (column <= 0) continue;
    const x = Math.round(centerX + dx);
    const top = baseY - column;
    ctx.fillStyle = dx > half * 0.35 ? COLORS.pileShade : COLORS.pile;
    ctx.fillRect(x, top, 1, column);
    ctx.fillStyle = COLORS.pileTop;
    ctx.fillRect(x, top, 1, Math.min(2, column));
    ctx.fillStyle = COLORS.pileEdge;
    ctx.fillRect(x, baseY - 1, 1, 1);
  }
}

const GRAVITY = 260; // ドット / 秒²

/** 投げた雪の粒を作る。origin から、landX あたり(地面の landY)に落ちるように速さを決める。 */
export function createParticles(count, now, random, { origin, landX, landY, spread }) {
  return Array.from({ length: count }, () => {
    const flightSeconds = 0.65 + random() * 0.35;
    const toX = landX + (random() - 0.5) * spread;
    const toY = landY - random() * 6;
    return {
      born: now,
      lifeMs: flightSeconds * 1000,
      x: origin.x + random() * 4,
      y: origin.y + random() * 4,
      vx: (toX - origin.x) / flightSeconds,
      vy: (toY - origin.y - 0.5 * GRAVITY * flightSeconds ** 2) / flightSeconds,
      isBig: random() < 0.35,
    };
  });
}

export function drawParticles(ctx, particles, now) {
  ctx.fillStyle = COLORS.particle;
  particles.forEach((p) => {
    const t = (now - p.born) / 1000;
    const size = p.isBig ? 3 : 2;
    ctx.fillRect(Math.round(p.x + p.vx * t), Math.round(p.y + p.vy * t + 0.5 * GRAVITY * t * t), size, size);
  });
}

/** 文字の演出(「+1」「COOL!」「LEVEL UP!」「JOIN!」など)。時間がたつと上へ浮かんで消える。 */
export function drawPopups(ctx, popups, now, isReduced) {
  popups.forEach((popup) => {
    const progress = Math.min(1, (now - popup.born) / popup.lifeMs);
    const rise = isReduced ? 0 : Math.round(popup.rise * progress);
    ctx.globalAlpha = progress > 0.7 ? 1 - (progress - 0.7) / 0.3 : 1;
    drawText(ctx, popup.text, popup.x, popup.y - rise, { color: popup.color, scale: popup.scale });
  });
  ctx.globalAlpha = 1;
}
