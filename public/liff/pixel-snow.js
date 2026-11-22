// 【若者】雪かき中のドット絵のアニメーション(Canvas 2D)。helper-working.js から startPixelSnow(canvas, ...) で動かす。
// - 小さなキャンバス(160×120 ドット)に描いてから、画面のキャンバスへ拡大して写す(にじませない)
// - 1 本の requestAnimationFrame のループで描く。画面が見えていないとき(document.hidden)は止める
// - 雪がしんしんと降り、オーロラがゆれ、ときどきマガンの群れが横切る。若者がスコップで雪を投げ続ける
// - 経過時間で玄関前の雪の山が減り、投げた先の山が増える
// - タップすると、すばやく 1 回投げて「+1」、続けるとコンボ。タップの回数はスコアにもサーバーにも送らない(見た目だけ)
// - 「動きを減らす」設定の人には、雪・鳥・オーロラを止め、タップの演出も控えめにする

import { prefersReducedMotion } from "./effects.js";
import {
  GROUND_Y,
  SCENE_HEIGHT as H,
  SCENE_WIDTH as W,
  createLayer,
  drawFrontLayer,
  drawSkyLayer,
} from "./pixel-backdrop.js";
import {
  EMPTY_COMBO,
  PILE_MIN_REMAINING,
  cheerFor,
  comboAt,
  createRandom,
  digLevel,
  flockSize,
  pileRemaining,
  registerTap,
} from "./pixel-game.js";
import { FONT, FONT_HEIGHT, GOOSE_FRAMES, HERO_FRAMES, PALETTE, TRANSPARENT, textWidth, toFontText } from "./pixel-sprites.js";

/** 描く間隔(1 秒に 30 回)。動きを減らす設定では 1 秒に 4 回。 */
const FRAME_MS = 1000 / 30;
const REDUCED_FRAME_MS = 250;

/** 若者の位置(左上)と、自動で雪を投げる 1 回の長さ・コマの切り替え。 */
const HERO_X = 74;
const HERO_Y = GROUND_Y - 20;
const CYCLE_MS = 1800;
const LIFT_AT_MS = 700;
const THROW_AT_MS = 1200;
const THROW_END_MS = 1600;
/** タップしたときの、すばやい 1 回(持ち上げ → 投げる)。 */
const QUICK_LIFT_MS = 80;
const QUICK_TOTAL_MS = 260;

/** 投げた雪の粒。投げ先(左の山)まで飛んで消える。 */
const THROW_ORIGIN = { x: HERO_X + 11, y: HERO_Y };
const THROW_TARGET_X = 34;
const GRAVITY = 120; // ドット / 秒²
const AUTO_PARTICLES = 5;
const TAP_PARTICLES = 9;
const MAX_PARTICLES = 80;

/** 玄関前の雪の山(左のはしは固定)と、投げた先の山。 */
const PILE_LEFT_EDGE = 86;
const PILE_MAX_HALF_WIDTH = 20;
const PILE_MAX_HEIGHT = 22;
const THROWN_PILE_X = THROW_TARGET_X;

/** 降る雪の数と、マガンの群れが来る間隔・横切る時間・最初に来るまで。 */
const SNOW_COUNT = 36;
const FLOCK_INTERVAL_MS = 35_000;
const FLOCK_CROSS_MS = 12_000;
const FLOCK_FIRST_DELAY_MS = 3000;

/** オーロラの柱の幅(ドット)。 */
const AURORA_COLUMN = 2;

/** 文字の演出の長さ。 */
const PLUS_ONE_MS = 650;
const CHEER_MS = 1200;
const MIN_COMBO_TO_SHOW = 2;

const COLORS = Object.freeze({
  pile: "#eef4ff",
  pileTop: "#ffffff",
  pileShade: "#c9d7f0",
  flake: "#ffffff",
  flakeSmall: "#cfe8ff",
  particle: "#ffffff",
  outline: "#0b1026",
  gold: "#ffc94d",
  ice: "#4fd1ff",
  auroraIce: "#4fd1ff",
  auroraPurple: "#8b5cf6",
  aurora3: "#6ee7b7",
  starBright: "#ffffff",
});

/** スプライトを、そのまま貼れる小さなキャンバスにしておく(毎回 1 ドットずつ描かなくてよい)。 */
function bakeSprite(rows, palette) {
  const layer = createLayer(rows[0].length, rows.length);
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === TRANSPARENT) return;
      layer.ctx.fillStyle = palette[ch];
      layer.ctx.fillRect(x, y, 1, 1);
    });
  });
  return layer.canvas;
}

const bakeFrames = (frames) =>
  Object.fromEntries(Object.entries(frames).map(([name, rows]) => [name, bakeSprite(rows, PALETTE)]));

/** ドットの文字を書く。読みやすいように、まわりを濃い色でふちどる。 */
function drawText(ctx, text, x, y, { color, scale = 1 }) {
  const chars = [...toFontText(text)];
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
  [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([dx, dy]) => paint(COLORS.outline, dx, dy));
  paint(color, 0, 0);
}

const centeredX = (text, scale) => Math.round((W - textWidth(toFontText(text), scale)) / 2);

/** 決まった並びの雪(位置は時間から計算するので、覚えておく必要がない)。 */
function createSnowflakes() {
  const random = createRandom(11);
  return Array.from({ length: SNOW_COUNT }, () => ({
    x: random() * W,
    y: random() * H,
    speed: 5 + random() * 8,
    sway: 1 + random() * 2.5,
    phase: random() * Math.PI * 2,
    isBig: random() < 0.3,
  }));
}

const wrap = (value, size) => ((value % size) + size) % size;

function drawSnowfall(ctx, flakes, seconds) {
  flakes.forEach((flake) => {
    const x = Math.round(wrap(flake.x + Math.sin(seconds * 0.8 + flake.phase) * flake.sway - seconds * 2, W));
    const y = Math.round(wrap(flake.y + seconds * flake.speed, H + 4) - 2);
    ctx.fillStyle = flake.isBig ? COLORS.flake : COLORS.flakeSmall;
    ctx.fillRect(x, y, flake.isBig ? 2 : 1, flake.isBig ? 2 : 1);
  });
}

/** オーロラ(2 本の光の帯が、ゆっくり波打つ)。 */
function drawAurora(ctx, ms) {
  const bands = [
    { base: 22, color: COLORS.auroraIce, alpha: 0.28, speed: 0.0006, height: 7 },
    { base: 30, color: COLORS.auroraPurple, alpha: 0.38, speed: -0.0004, height: 6 },
    { base: 18, color: COLORS.aurora3, alpha: 0.14, speed: 0.0009, height: 4 },
  ];
  bands.forEach((band) => {
    ctx.globalAlpha = band.alpha;
    ctx.fillStyle = band.color;
    // 2 ドットずつの柱で描く(描く回数を半分にして軽くする)
    for (let x = 0; x < W; x += AURORA_COLUMN) {
      const y = band.base + 4 * Math.sin(x * 0.06 + ms * band.speed) + 2 * Math.sin(x * 0.15 - ms * band.speed * 1.5);
      ctx.fillRect(x, Math.round(y), AURORA_COLUMN, band.height);
    }
  });
  ctx.globalAlpha = 1;
}

/** マガンの群れ(V の字)。レベルが上がるほど仲間が増える。 */
function drawFlock(ctx, geese, sinceStartMs, level) {
  const local = wrap(sinceStartMs - FLOCK_FIRST_DELAY_MS, FLOCK_INTERVAL_MS);
  if (local > FLOCK_CROSS_MS) return;
  const leadX = -30 + (local / FLOCK_CROSS_MS) * (W + 60);
  const leadY = 24 + 3 * Math.sin(local / 900);
  const frame = Math.floor(local / 220) % 2 === 0 ? geese.up : geese.down;
  Array.from({ length: flockSize(level) }, (_, i) => {
    const rank = Math.ceil(i / 2);
    const side = i % 2 === 0 ? 1 : -1;
    return { x: leadX - rank * 8, y: leadY + side * rank * 4 };
  }).forEach(({ x, y }) => ctx.drawImage(frame, Math.round(x), Math.round(y)));
}

/** 半円の雪の山(上のふちは白く、右側は少し影)。 */
function drawMound(ctx, centerX, halfWidth, height) {
  const half = Math.max(1, Math.round(halfWidth));
  for (let dx = -half; dx <= half; dx += 1) {
    const column = Math.round(height * Math.sqrt(Math.max(0, 1 - (dx / half) ** 2)));
    if (column <= 0) continue;
    const x = Math.round(centerX + dx);
    ctx.fillStyle = dx > half * 0.35 ? COLORS.pileShade : COLORS.pile;
    ctx.fillRect(x, GROUND_Y + 1 - column, 1, column);
    ctx.fillStyle = COLORS.pileTop;
    ctx.fillRect(x, GROUND_Y + 1 - column, 1, 1);
  }
}

function drawPiles(ctx, elapsedMs) {
  const remaining = pileRemaining(elapsedMs);
  const halfWidth = 6 + (PILE_MAX_HALF_WIDTH - 6) * remaining;
  drawMound(ctx, PILE_LEFT_EDGE + halfWidth, halfWidth, 2 + (PILE_MAX_HEIGHT - 2) * remaining);
  const moved = (1 - remaining) / (1 - PILE_MIN_REMAINING);
  if (moved > 0.02) drawMound(ctx, THROWN_PILE_X, 3 + 12 * moved, 1 + 12 * moved);
}

/** 投げた雪の粒を作る(投げ先の山の近くに落ちるように、速さを決める)。 */
function createParticles(count, now, random) {
  return Array.from({ length: count }, () => {
    const flightSeconds = 0.8 + random() * 0.45;
    const landX = THROW_TARGET_X + (random() - 0.5) * 18;
    const landY = GROUND_Y - 2 - random() * 6;
    return {
      born: now,
      lifeMs: flightSeconds * 1000,
      x: THROW_ORIGIN.x + random() * 3,
      y: THROW_ORIGIN.y + random() * 2,
      vx: (landX - THROW_ORIGIN.x) / flightSeconds,
      vy: (landY - THROW_ORIGIN.y - 0.5 * GRAVITY * flightSeconds ** 2) / flightSeconds,
      isBig: random() < 0.35,
    };
  });
}

function drawParticles(ctx, particles, now) {
  ctx.fillStyle = COLORS.particle;
  particles.forEach((p) => {
    const t = (now - p.born) / 1000;
    const size = p.isBig ? 2 : 1;
    ctx.fillRect(Math.round(p.x + p.vx * t), Math.round(p.y + p.vy * t + 0.5 * GRAVITY * t * t), size, size);
  });
}

/** 文字の演出(「+1」「COOL!」「LEVEL UP!」など)。時間がたつと上へ浮かんで消える。 */
function drawPopups(ctx, popups, now, isReduced) {
  popups.forEach((popup) => {
    const progress = Math.min(1, (now - popup.born) / popup.lifeMs);
    const rise = isReduced ? 0 : Math.round(popup.rise * progress);
    ctx.globalAlpha = progress > 0.7 ? 1 - (progress - 0.7) / 0.3 : 1;
    drawText(ctx, popup.text, popup.x, popup.y - rise, { color: popup.color, scale: popup.scale });
  });
  ctx.globalAlpha = 1;
}

/** 今の若者のコマ。タップ直後はすばやい 1 回、それ以外は自動のくり返し。 */
function heroFrameName({ now, quickStartedAt, isReduced }) {
  const sinceQuick = now - quickStartedAt;
  if (sinceQuick < QUICK_TOTAL_MS) return sinceQuick < QUICK_LIFT_MS ? "lift" : "throw";
  if (isReduced) return "dig";
  const phase = now % CYCLE_MS;
  if (phase < LIFT_AT_MS) return "dig";
  if (phase < THROW_AT_MS) return "lift";
  return phase < THROW_END_MS ? "throw" : "dig";
}

/** ときどき光る(またたく)星。 */
function drawTwinkles(ctx, stars, ms) {
  ctx.fillStyle = COLORS.starBright;
  stars.forEach((star, i) => {
    if (Math.floor(ms / 700 + i * 1.7) % 3 !== 0) return;
    ctx.fillRect(star.x - 1, star.y, 3, 1);
    ctx.fillRect(star.x, star.y - 1, 1, 3);
  });
}

/** 画面のキャンバスの大きさを、端末の細かさ(devicePixelRatio)に合わせる。160 の整数倍にして、くっきり拡大する。 */
function fitCanvas(canvas) {
  const ratio = window.devicePixelRatio || 1;
  const cssWidth = canvas.clientWidth || W;
  const scale = Math.max(1, Math.ceil((cssWidth * ratio) / W));
  if (canvas.width !== W * scale) {
    canvas.width = W * scale;
    canvas.height = H * scale;
  }
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

/**
 * ドット絵のアニメーションを始める。
 * @param {HTMLCanvasElement} canvas 画面に出すキャンバス
 * @param {{ getElapsedMs: () => number }} options 雪かきを始めてからの時間(サーバーの開始時刻から計算)
 * @returns {{ stop: () => void }} 止める関数
 */
export function startPixelSnow(canvas, { getElapsedMs }) {
  const isReduced = prefersReducedMotion();
  const random = createRandom(Date.now() & 0xffff);
  const buffer = createLayer();
  const sky = drawSkyLayer();
  const front = drawFrontLayer();
  const hero = bakeFrames(HERO_FRAMES);
  const geese = bakeFrames(GOOSE_FRAMES);
  const flakes = createSnowflakes();
  const twinkles = [
    { x: 20, y: 10 },
    { x: 58, y: 6 },
    { x: 96, y: 12 },
    { x: 118, y: 40 },
  ];
  const startedAt = performance.now();

  let screen = fitCanvas(canvas);
  let combo = EMPTY_COMBO;
  let particles = [];
  let popups = [];
  let quickStartedAt = Number.NEGATIVE_INFINITY;
  let thrownCycle = -1;
  let shownLevel = digLevel(getElapsedMs());
  let frameId = 0;
  let lastDrawAt = 0;

  const addPopup = (popup) => {
    popups = [...popups, popup];
  };
  const addParticles = (count, now) => {
    if (isReduced) return;
    particles = [...particles, ...createParticles(count, now, random)].slice(-MAX_PARTICLES);
  };

  /** 自動で投げるコマに入ったとき(1 回につき 1 度だけ)、雪の粒を飛ばす。 */
  function throwAutomatically(now) {
    if (isReduced || now - quickStartedAt < QUICK_TOTAL_MS) return;
    const cycle = Math.floor(now / CYCLE_MS);
    if (now % CYCLE_MS < THROW_AT_MS || cycle === thrownCycle) return;
    thrownCycle = cycle;
    addParticles(AUTO_PARTICLES, now);
  }

  function checkLevelUp(level, now) {
    if (level <= shownLevel) return;
    shownLevel = level;
    addPopup({ text: "LEVEL UP!", x: centeredX("LEVEL UP!", 2), y: 52, color: COLORS.gold, scale: 2, born: now, lifeMs: 1800, rise: 10 });
  }

  function drawScene(now) {
    const ms = isReduced ? 0 : now - startedAt;
    const elapsedMs = getElapsedMs();
    const level = digLevel(elapsedMs);
    const ctx = buffer.ctx;
    checkLevelUp(level, now);
    throwAutomatically(now);
    particles = particles.filter((p) => now - p.born < p.lifeMs);
    popups = popups.filter((p) => now - p.born < p.lifeMs);

    ctx.drawImage(sky, 0, 0);
    drawAurora(ctx, ms);
    drawTwinkles(ctx, twinkles, ms);
    if (!isReduced) drawFlock(ctx, geese, ms, level);
    ctx.drawImage(front, 0, 0);
    drawPiles(ctx, elapsedMs);
    ctx.drawImage(hero[heroFrameName({ now, quickStartedAt, isReduced })], HERO_X, HERO_Y);
    drawParticles(ctx, particles, now);
    drawSnowfall(ctx, flakes, ms / 1000);
    const count = comboAt(combo, now);
    if (count >= MIN_COMBO_TO_SHOW) {
      const text = `COMBO x${count}`;
      drawText(ctx, text, centeredX(text, 2), 4, { color: COLORS.ice, scale: 2 });
    }
    drawPopups(ctx, popups, now, isReduced);

    screen.drawImage(buffer.canvas, 0, 0, screen.canvas.width, screen.canvas.height);
  }

  function loop(now) {
    frameId = requestAnimationFrame(loop);
    if (now - lastDrawAt < (isReduced ? REDUCED_FRAME_MS : FRAME_MS)) return;
    lastDrawAt = now;
    drawScene(now);
  }

  function start() {
    if (frameId || document.hidden) return;
    frameId = requestAnimationFrame(loop);
  }

  function pause() {
    cancelAnimationFrame(frameId);
    frameId = 0;
  }

  /** タップ: その場ですばやく 1 回投げて「+1」。コンボの節目で声が出る(スコアには入らない)。 */
  function onTap(event) {
    const now = performance.now();
    const box = canvas.getBoundingClientRect();
    const tapX = ((event.clientX - box.left) / box.width) * W;
    const tapY = ((event.clientY - box.top) / box.height) * H;
    combo = registerTap(combo, now);
    quickStartedAt = now;
    addParticles(TAP_PARTICLES, now);
    const plusX = Math.round(Math.min(W - 10, Math.max(2, tapX - 3)));
    const plusY = Math.round(Math.min(H - 8, Math.max(16, tapY - 6)));
    addPopup({ text: "+1", x: plusX, y: plusY, color: COLORS.gold, scale: 1, born: now, lifeMs: PLUS_ONE_MS, rise: 12 });
    const cheer = cheerFor(combo.count);
    if (cheer) {
      addPopup({ text: cheer, x: centeredX(cheer, 3), y: 36, color: COLORS.gold, scale: 3, born: now, lifeMs: CHEER_MS, rise: 6 });
    }
    if (isReduced) drawScene(now);
  }

  const onVisibility = () => (document.hidden ? pause() : start());
  const resizeObserver = new ResizeObserver(() => {
    screen = fitCanvas(canvas);
  });

  canvas.addEventListener("pointerdown", onTap);
  document.addEventListener("visibilitychange", onVisibility);
  resizeObserver.observe(canvas);
  drawScene(performance.now());
  start();

  return {
    stop() {
      pause();
      canvas.removeEventListener("pointerdown", onTap);
      document.removeEventListener("visibilitychange", onVisibility);
      resizeObserver.disconnect();
    },
  };
}
