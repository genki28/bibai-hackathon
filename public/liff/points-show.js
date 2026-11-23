// 【若者】お疲れ様の画面の「派手なポイントの演出」(finish.js から celebratePoints を呼ぶ)。
// - 画面いっぱいにドット絵の花火を何回も打ち上げる(Canvas。四角い粒だけで描く)
// - ポイントの札の後ろで光の筋が回り、画面がゆれる。数字はスロットのように回ってから止まり、「+〇〇pt!」の判子が押される
// - 記録の行は 1 行ずつ飛び出す。ファンファーレも鳴らす(音を出せない端末では鳴らない。[もう一度見る] で音つき)
// - 「動きを減らす」設定の人には、動かさずに最後の数字だけ見せる
// 注意: 画面に文字を入れるときは必ず textContent を使う(innerHTML は使わない)。

import { prefersReducedMotion } from "./effects.js";

/** 数字が回る時間(ミリ秒)と、花火を打ち上げる回数・間隔。 */
const ROLL_MS = 2200;
const BURSTS = 7;
const BURST_GAP_MS = 380;
const FIREWORK_MS = 4800;
/** 花火の色(デザインの色 + 金色)と、1 発の粒の数・粒の大きさ(px)。 */
const COLORS = Object.freeze(["#b73e2c", "#ffc94d", "#4fd1ff", "#ffffff", "#f26b1d"]);
const PARTICLES_PER_BURST = 46;
const PIXEL = 5;
const GRAVITY = 0.12;
/** 記録の行が飛び出す間隔(ミリ秒)。 */
const ROW_GAP_MS = 120;
/** ファンファーレ(ドミソドー ソドー)の音と長さ(秒)。 */
const FANFARE = Object.freeze([
  [523, 0.12],
  [659, 0.12],
  [784, 0.12],
  [1047, 0.32],
  [784, 0.12],
  [1047, 0.5],
]);

let audio = null;

/** ファンファーレを鳴らす(ゲーム機のような四角い音)。音を出せない端末では何もしない。 */
function playFanfare() {
  try {
    const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContextClass) return;
    audio ??= new AudioContextClass();
    audio.resume();
    let at = audio.currentTime + 0.05;
    FANFARE.forEach(([frequency, seconds]) => {
      const osc = audio.createOscillator();
      osc.type = "square";
      osc.frequency.value = frequency;
      const gain = audio.createGain();
      gain.gain.setValueAtTime(0.12, at);
      gain.gain.exponentialRampToValueAtTime(0.001, at + seconds);
      osc.connect(gain).connect(audio.destination);
      osc.start(at);
      osc.stop(at + seconds);
      at += seconds;
    });
  } catch (error) {
    console.error("ファンファーレを鳴らせませんでした", error);
  }
}

/** 画面いっぱいのドット絵の花火。 */
function launchFireworks() {
  const canvas = document.createElement("canvas");
  canvas.className = "firework-canvas";
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.append(canvas);
  const ctx = canvas.getContext("2d");
  let particles = [];

  const burst = () => {
    const x = canvas.width * (0.15 + Math.random() * 0.7);
    const y = canvas.height * (0.12 + Math.random() * 0.35);
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const next = Array.from({ length: PARTICLES_PER_BURST }, (_, i) => {
      const angle = (i / PARTICLES_PER_BURST) * Math.PI * 2;
      const speed = 2.5 + Math.random() * 3.5;
      return { x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1, color: i % 5 === 0 ? "#ffffff" : color };
    });
    particles = [...particles, ...next];
  };

  const startedAt = performance.now();
  const timers = Array.from({ length: BURSTS }, (_, i) => setTimeout(burst, i * BURST_GAP_MS));
  const step = (now) => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles = particles
      .map((p) => ({ ...p, x: p.x + p.vx, y: p.y + p.vy, vx: p.vx * 0.985, vy: p.vy * 0.985 + GRAVITY, life: p.life - 0.012 }))
      .filter((p) => p.life > 0);
    particles.forEach((p) => {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      // ドット絵らしく、マス目に合わせた四角で描く
      ctx.fillRect(Math.round(p.x / PIXEL) * PIXEL, Math.round(p.y / PIXEL) * PIXEL, PIXEL, PIXEL);
    });
    ctx.globalAlpha = 1;
    if (now - startedAt < FIREWORK_MS || particles.length > 0) {
      requestAnimationFrame(step);
    } else {
      timers.forEach(clearTimeout);
      canvas.remove();
    }
  };
  requestAnimationFrame(step);
}

/** 数字をスロットのように回してから、target で止める。 */
function rollNumber(element, target, format) {
  return new Promise((resolve) => {
    const startedAt = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - startedAt) / ROLL_MS);
      // はじめは数字がばらばらに回り、だんだん目標に近づいて止まる
      const eased = 1 - (1 - t) ** 4;
      const jitter = t < 0.85 ? Math.floor(Math.random() * Math.max(10, target) * (1 - eased)) : 0;
      element.textContent = format(Math.max(0, Math.round(target * eased) + jitter));
      if (t < 1) requestAnimationFrame(step);
      else {
        element.textContent = format(target);
        resolve();
      }
    };
    requestAnimationFrame(step);
  });
}

/** 「+〇〇pt!」の判子を、数字のすぐ下に押す。 */
function stamp(scoreElement, text) {
  scoreElement.parentElement.querySelector(".score-stamp")?.remove();
  const mark = document.createElement("p");
  mark.className = "score-stamp";
  mark.textContent = text;
  scoreElement.after(mark);
}

/** 記録の行を 1 行ずつ飛び出させる。 */
function popRows(rows) {
  rows.forEach((row, i) => {
    row.classList.remove("is-pop");
    row.style.setProperty("--delay", `${i * ROW_GAP_MS}ms`);
    void row.offsetWidth; // アニメーションをやり直すため
    row.classList.add("is-pop");
  });
}

/**
 * ポイントの演出をする。
 * @param {{ scoreElement: HTMLElement, card: HTMLElement, rows: HTMLElement[], total: number, format: (n: number) => string }} options
 * @returns {Promise<void>}
 */
export async function celebratePoints({ scoreElement, card, rows, total, format }) {
  if (prefersReducedMotion()) {
    scoreElement.textContent = format(total);
    stamp(scoreElement, `+${format(total)}!`);
    return;
  }
  playFanfare();
  launchFireworks();
  document.body.classList.remove("is-shaking");
  void document.body.offsetWidth;
  document.body.classList.add("is-shaking");
  card.classList.add("is-celebrating");
  popRows(rows);
  await rollNumber(scoreElement, total, format);
  scoreElement.classList.remove("is-pop");
  void scoreElement.offsetWidth;
  scoreElement.classList.add("is-pop");
  stamp(scoreElement, `+${format(total)}!`);
}
