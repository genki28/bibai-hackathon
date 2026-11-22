// 【若者】雪かき中のドット絵のアニメーション(Canvas 2D)。helper-working.js から startPixelSnow(canvas, ...) で動かす。
// - 背景(images/working-bg.png)と主人公の 4 コマ(images/working-hero.png)は ChatGPT で作った画像。読み込めたら始める
// - 背景の半分の大きさ(362×272)の小さなキャンバスに描いてから、画面のキャンバスへ拡大して写す(にじませない)
// - いっしょに雪かきする人(参加者)の人数ぶん主人公を並べる。左右に交互に、真ん中の雪の山を向く(並べ方は pixel-crew.js)
//   途中で人が増えたら、横から歩いて入ってきて「JOIN!」。頭の上に名前(自分は黄金色 + ▼、リーダーには王冠)
// - 1 本の requestAnimationFrame のループで描く。画面が見えていないとき(document.hidden)は止める
// - 雪がしんしんと降り、ときどきマガンの群れが横切る。全員が 差す → 持ち上げる → 振りかぶる → 投げる をくり返す(人ごとに少しずらす)
// - 経過時間で真ん中の雪の山が減り、投げた雪は外側(それぞれの後ろ)に積もる
// - タップすると、自分がすばやく 1 回投げて「+1」、続けるとコンボ。タップの回数はスコアにもサーバーにも送らない(見た目だけ)
// - 「動きを減らす」設定の人には、雪・鳥・登場の歩きを止め、タップの演出も控えめにする
// 注意: 画面に文字を入れるときは必ず textContent を使う(innerHTML は使わない)。

import { prefersReducedMotion } from "./effects.js";
import { MAX_CREW, crewFrameOffset, crewLayout, easeOut, lerp, shortName } from "./pixel-crew.js";
import {
  COLORS,
  bakeImage,
  bakeSprite,
  createLayer,
  createParticles,
  createSnowflakes,
  drawFlock,
  drawMound,
  drawParticles,
  drawPopups,
  drawSnowfall,
  drawText,
  textLeft,
} from "./pixel-draw.js";
import {
  EMPTY_COMBO,
  HERO_CYCLE_MS,
  HERO_FRAME_COUNT,
  PILE_MIN_REMAINING,
  THROW_FRAME,
  cheerFor,
  comboAt,
  createRandom,
  digLevel,
  frameRect,
  heroFrameIndex,
  moundSize,
  pileRemaining,
  registerTap,
} from "./pixel-game.js";
import { CROWN, GOOSE_FRAMES } from "./pixel-sprites.js";

const BACKGROUND_URL = new URL("./images/working-bg.png", import.meta.url).href;
const HERO_URL = new URL("./images/working-hero.png", import.meta.url).href;

/** 小さなキャンバスの大きさ(背景 724×543 の半分)。 */
const W = 362;
const H = 272;

/** 描く間隔(1 秒に 30 回)。動きを減らす設定では 1 秒に 4 回。 */
const FRAME_MS = 1000 / 30;
const REDUCED_FRAME_MS = 250;

/** みんなが向き合う真ん中(雪の山の真ん中)と、いちばん手前の人の足の下端。 */
const CENTER_X = 181;
const FEET_Y = 236;

/** 雪の山: 真ん中の大きな山と、玄関(背景の x≈315〜330, 下≈155)の前の小さな山。大きさは残りの割合で最小〜最大。 */
const CENTER_MOUND = Object.freeze({ centerX: CENTER_X, baseY: 239, minHalfWidth: 8, maxHalfWidth: 32, minHeight: 3, maxHeight: 40 });
const DOOR_MOUND = Object.freeze({ centerX: 318, baseY: 172, minHalfWidth: 4, maxHalfWidth: 16, minHeight: 2, maxHeight: 13 });
/** 投げた雪が積もる、左右の外側の山(雪かきが進むほど大きくなる)。右は右側に人がいるときだけ。 */
const THROWN_MOUNDS = Object.freeze({
  left: { centerX: 20, baseY: 242, minHalfWidth: 5, maxHalfWidth: 30, minHeight: 2, maxHeight: 26 },
  right: { centerX: 346, baseY: 242, minHalfWidth: 4, maxHalfWidth: 20, minHeight: 2, maxHeight: 20 },
});

/** 振りかぶったスコップの位置(コマの中の割合。右向きのとき)。投げる雪の粒はここから外側へ飛ぶ。 */
const SHOVEL_BACK_IN_FRAME = { x: 0.12, y: 0.15 };
const AUTO_PARTICLES = 4;
const TAP_PARTICLES = 12;
const MAX_PARTICLES = 100;

/** 登場(横から歩いて入る)と、人数が変わったときに位置をずらす時間。 */
const ENTER_MS = 1600;
const MOVE_MS = 700;
const WALK_STEP_MS = 150;

/** 降る雪の数と、マガン・王冠の拡大の倍率。 */
const SNOW_COUNT = 50;
const GOOSE_SCALE = 2;
const CROWN_SCALE = 2;

/** 文字の演出の長さと大きさ(ドットの文字の拡大の倍率)。 */
const PLUS_ONE_MS = 650;
const CHEER_MS = 1200;
const LEVEL_UP_MS = 1800;
const JOIN_MS = 1400;
const MIN_COMBO_TO_SHOW = 2;
const TEXT_SCALE = Object.freeze({ plusOne: 2, combo: 3, cheer: 6, levelUp: 4, join: 2 });

/** 画像を読み込む(読み込めたら終わる、失敗したらエラー)。 */
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`画像を読み込めませんでした: ${url}`));
    image.src = url;
  });
}

/** 画面のキャンバスの大きさを、端末の細かさ(devicePixelRatio)に合わせる。W の整数倍にして、くっきり拡大する。 */
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

/** 主人公の 4 コマを、大きさと向きごとに 1 回だけ用意する(同じ大きさなら使い回す)。 */
function createHeroFrames(image) {
  const frameWidth = image.naturalWidth / HERO_FRAME_COUNT;
  const frameHeight = image.naturalHeight;
  const cache = new Map();
  return {
    aspect: frameWidth / frameHeight,
    get({ width, height, isFlipped }) {
      const key = `${width}x${height}:${isFlipped}`;
      if (!cache.has(key)) {
        const frames = Array.from({ length: HERO_FRAME_COUNT }, (_, i) =>
          bakeImage(image, frameRect(i, frameWidth, frameHeight), width, height, isFlipped),
        );
        cache.set(key, frames);
      }
      return cache.get(key);
    },
  };
}

/** 画面の外(左の人は左、右の人は右)の位置。登場のときはここから歩いて入ってくる。 */
const offscreenOf = (place) => ({ left: place.side === "left" ? -place.width - 10 : W + 10, top: place.top });

/** 参加者の並び(id・名前・順番)が同じか。同じなら並べ直さない。 */
const crewKey = (people) => people.map((p) => `${p.id}:${p.name}:${p.isMe}:${p.isLeader}`).join("|");

/** 名前の札(HTML)。キャンバスの上に、% で位置を決めて重ねる。 */
function renderLabels(container, crew) {
  if (!container) return;
  container.replaceChildren(
    ...crew.map((member) => {
      const label = document.createElement("span");
      label.className = ["crew-name", member.isMe ? "is-me" : "", member.isEntering ? "is-hidden" : ""].join(" ").trim();
      // 札の下のはし: 頭の上(リーダーは王冠の上)。自分は ▼ の分だけさらに上
      const bottomY = member.place.top + (member.isLeader ? -10 : 2) - (member.isMe ? 7 : 0);
      label.style.left = `${(member.place.bodyX / W) * 100}%`;
      label.style.top = `${(bottomY / H) * 100}%`;
      const name = document.createElement("span");
      name.textContent = shortName(member.name);
      label.append(name);
      if (member.isMe) {
        const mark = document.createElement("span");
        mark.className = "crew-me-mark";
        mark.textContent = "▼";
        label.append(mark);
      }
      return label;
    }),
  );
}

/**
 * ドット絵のアニメーションを始める。画像が読み込めなければエラーで終わる(呼んだ側で絵を隠す)。
 * @param {HTMLCanvasElement} canvas 画面に出すキャンバス
 * @param {{
 *   getElapsedMs: () => number,
 *   crew: Array<{ id: string, name: string, isMe: boolean, isLeader: boolean }>,
 *   labels?: HTMLElement | null,
 * }} options 経過時間(サーバーの開始時刻から計算)・参加者(参加した順)・名前の札を入れる場所
 * @returns {Promise<{ stop: () => void, setCrew: (crew: Array<{ id: string, name: string, isMe: boolean, isLeader: boolean }>) => void }>}
 */
export async function startPixelSnow(canvas, { getElapsedMs, crew: firstCrew, labels = null }) {
  const [backgroundImage, heroImage] = await Promise.all([loadImage(BACKGROUND_URL), loadImage(HERO_URL)]);
  const isReduced = prefersReducedMotion();
  const random = createRandom(Date.now() & 0xffff);
  const buffer = createLayer(W, H);
  const background = bakeImage(
    backgroundImage,
    { sx: 0, sy: 0, sw: backgroundImage.naturalWidth, sh: backgroundImage.naturalHeight },
    W,
    H,
  );
  const heroFrames = createHeroFrames(heroImage);
  const sceneSize = { sceneHeight: H, centerX: CENTER_X, feetY: FEET_Y, frameAspect: heroFrames.aspect };
  const geese = { up: bakeSprite(GOOSE_FRAMES.up, GOOSE_SCALE), down: bakeSprite(GOOSE_FRAMES.down, GOOSE_SCALE) };
  const crown = bakeSprite(CROWN, CROWN_SCALE);
  const flakes = createSnowflakes(SNOW_COUNT, W, H);
  const startedAt = performance.now();

  let screen = fitCanvas(canvas);
  let crew = [];
  let shownCrewKey = "";
  let combo = EMPTY_COMBO;
  let particles = [];
  let popups = [];
  let quickStartedAt = Number.NEGATIVE_INFINITY;
  let shownLevel = digLevel(getElapsedMs());
  let frameId = 0;
  let lastDrawAt = 0;

  const addPopup = (popup) => {
    popups = [...popups, popup];
  };

  /** 今の位置(登場や並べ直しの途中なら、その途中の位置)。 */
  function positionOf(member, now) {
    const progress = easeOut((now - member.movedAt) / member.moveMs);
    const isWalking = member.isEntering && progress < 1;
    const bob = isWalking ? Math.round(Math.abs(Math.sin(now / 110)) * 3) : 0;
    return {
      left: Math.round(lerp(member.from.left, member.place.left, progress)),
      top: Math.round(lerp(member.from.top, member.place.top, progress)) - bob,
      isArrived: progress >= 1,
    };
  }

  /** 参加者を並べ直す。新しく来た人は横から歩いて入ってくる(最初の表示と、動きを減らす設定では、すぐその場に出る)。 */
  function setCrew(people, now = performance.now()) {
    const list = people.slice(0, MAX_CREW);
    const key = crewKey(list);
    if (list.length === 0 || key === shownCrewKey) return;
    const isFirst = shownCrewKey === "";
    shownCrewKey = key;
    const layout = crewLayout(list.length, sceneSize);
    crew = list.map((person, index) => {
      const place = layout[index];
      const old = crew.find((member) => member.id === person.id);
      const isEntering = !old && !isFirst && !isReduced;
      const from = old ? positionOf(old, now) : isEntering ? offscreenOf(place) : place;
      return {
        ...person,
        index,
        place,
        from: { left: from.left, top: from.top },
        movedAt: now,
        moveMs: isEntering ? ENTER_MS : MOVE_MS,
        isEntering,
        lastFrame: old?.lastFrame ?? 0,
      };
    });
    renderLabels(labels, crew);
  }

  /** 歩いて入ってきた人が着いたら、「JOIN!」を出して名前の札を見せる。 */
  function finishEntering(now) {
    const arrived = crew.filter((member) => member.isEntering && positionOf(member, now).isArrived);
    if (arrived.length === 0) return;
    crew = crew.map((member) => (arrived.includes(member) ? { ...member, isEntering: false } : member));
    arrived.forEach((member) => {
      const scale = TEXT_SCALE.join;
      addPopup({ text: "JOIN!", x: textLeft("JOIN!", scale, member.place.bodyX), y: member.place.top - 4, color: COLORS.ice, scale, born: now, lifeMs: JOIN_MS, rise: 14 });
    });
    renderLabels(labels, crew);
  }

  const isQuickThrowing = (now) => heroFrameIndex({ now, quickStartedAt, isReduced: true }) !== 0;

  /** その人のいまのコマ。歩いている間は 0 と 1 を交互に、それ以外は人ごとにずらしてくり返す。 */
  function frameOf(member, now, position) {
    if (member.isEntering && !position.isArrived) return Math.floor(now / WALK_STEP_MS) % 2;
    const offset = crewFrameOffset(member.index, HERO_CYCLE_MS);
    const quick = member.isMe ? quickStartedAt + offset : Number.NEGATIVE_INFINITY;
    return heroFrameIndex({ now: now + offset, quickStartedAt: quick, isReduced });
  }

  /** その人の後ろ(外側)へ、雪の粒を飛ばす。 */
  function throwSnow(member, position, count, now) {
    if (isReduced) return;
    const { width, height, isFlipped, side } = member.place;
    const origin = {
      x: position.left + width * (isFlipped ? 1 - SHOVEL_BACK_IN_FRAME.x : SHOVEL_BACK_IN_FRAME.x),
      y: position.top + height * SHOVEL_BACK_IN_FRAME.y,
    };
    const target = THROWN_MOUNDS[side];
    const spread = target.maxHalfWidth;
    const next = createParticles(count, now, random, { origin, landX: target.centerX, landY: target.baseY - 2, spread });
    particles = [...particles, ...next].slice(-MAX_PARTICLES);
  }

  function checkLevelUp(level, now) {
    if (level <= shownLevel) return;
    shownLevel = level;
    const scale = TEXT_SCALE.levelUp;
    addPopup({ text: "LEVEL UP!", x: textLeft("LEVEL UP!", scale, W / 2), y: 118, color: COLORS.gold, scale, born: now, lifeMs: LEVEL_UP_MS, rise: 16 });
  }

  function drawPiles(ctx, elapsedMs) {
    const remaining = pileRemaining(elapsedMs);
    drawMound(ctx, DOOR_MOUND.centerX, DOOR_MOUND.baseY, moundSize(remaining, DOOR_MOUND));
    const moved = (1 - remaining) / (1 - PILE_MIN_REMAINING);
    if (moved > 0.02) {
      const sides = new Set(crew.map((member) => member.place.side));
      [...sides].forEach((side) => {
        const mound = THROWN_MOUNDS[side];
        drawMound(ctx, mound.centerX, mound.baseY, moundSize(moved, mound));
      });
    }
    drawMound(ctx, CENTER_MOUND.centerX, CENTER_MOUND.baseY, moundSize(remaining, CENTER_MOUND));
  }

  /** 参加者を、奥(外側)の人から順に描く。投げるコマに入ったら雪の粒を飛ばす。 */
  function drawCrew(ctx, now) {
    const isQuick = isQuickThrowing(now);
    const order = [...crew].sort((a, b) => b.place.rank - a.place.rank || a.index - b.index);
    const lastFrames = new Map();
    order.forEach((member) => {
      const position = positionOf(member, now);
      const frame = frameOf(member, now, position);
      const isTapping = member.isMe && isQuick;
      if (frame === THROW_FRAME && member.lastFrame !== THROW_FRAME && !isTapping && position.isArrived) {
        throwSnow(member, position, AUTO_PARTICLES, now);
      }
      lastFrames.set(member.id, frame);
      ctx.drawImage(heroFrames.get(member.place)[frame], position.left, position.top);
      if (member.isLeader && position.isArrived) {
        ctx.drawImage(crown, Math.round(member.place.bodyX - crown.width / 2), member.place.top - crown.height + 4);
      }
    });
    crew = crew.map((member) => ({ ...member, lastFrame: lastFrames.get(member.id) ?? member.lastFrame }));
  }

  function drawScene(now) {
    const ms = isReduced ? 0 : now - startedAt;
    const elapsedMs = getElapsedMs();
    const level = digLevel(elapsedMs);
    finishEntering(now);
    checkLevelUp(level, now);
    particles = particles.filter((p) => now - p.born < p.lifeMs);
    popups = popups.filter((p) => now - p.born < p.lifeMs);

    const ctx = buffer.ctx;
    ctx.drawImage(background, 0, 0);
    if (!isReduced) drawFlock(ctx, geese, ms, level);
    drawPiles(ctx, elapsedMs);
    drawCrew(ctx, now);
    drawParticles(ctx, particles, now);
    drawSnowfall(ctx, flakes, ms / 1000);
    const count = comboAt(combo, now);
    if (count >= MIN_COMBO_TO_SHOW) {
      const text = `COMBO x${count}`;
      drawText(ctx, text, textLeft(text, TEXT_SCALE.combo, W / 2), 8, { color: COLORS.ice, scale: TEXT_SCALE.combo });
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

  /** タップ: 自分がすばやく 1 回投げて「+1」。コンボの節目で声が出る(スコアには入らない)。 */
  function onTap(event) {
    const now = performance.now();
    const box = canvas.getBoundingClientRect();
    const tapX = ((event.clientX - box.left) / box.width) * W;
    const tapY = ((event.clientY - box.top) / box.height) * H;
    combo = registerTap(combo, now);
    quickStartedAt = now;
    const me = crew.find((member) => member.isMe) ?? crew[0];
    if (me) throwSnow(me, positionOf(me, now), TAP_PARTICLES, now);
    const plus = TEXT_SCALE.plusOne;
    const plusX = Math.round(Math.min(W - 20, Math.max(4, tapX - 7)));
    const plusY = Math.round(Math.min(H - 16, Math.max(40, tapY - 12)));
    addPopup({ text: "+1", x: plusX, y: plusY, color: COLORS.gold, scale: plus, born: now, lifeMs: PLUS_ONE_MS, rise: 24 });
    const cheer = cheerFor(combo.count);
    if (cheer) {
      const scale = TEXT_SCALE.cheer;
      addPopup({ text: cheer, x: textLeft(cheer, scale, W / 2), y: 70, color: COLORS.gold, scale, born: now, lifeMs: CHEER_MS, rise: 12 });
    }
    if (isReduced) drawScene(now);
  }

  const onVisibility = () => (document.hidden ? pause() : start());
  const resizeObserver = new ResizeObserver(() => {
    screen = fitCanvas(canvas);
  });

  setCrew(firstCrew);
  canvas.addEventListener("pointerdown", onTap);
  document.addEventListener("visibilitychange", onVisibility);
  resizeObserver.observe(canvas);
  drawScene(performance.now());
  start();

  return {
    setCrew: (people) => setCrew(people),
    stop() {
      pause();
      canvas.removeEventListener("pointerdown", onTap);
      document.removeEventListener("visibilitychange", onVisibility);
      resizeObserver.disconnect();
    },
  };
}
