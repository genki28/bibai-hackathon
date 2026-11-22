// 画面の演出で共通に使う部品(カウントアップ・雪の紙吹雪)。
// 端末で「動きを減らす」設定の人には、動かさずに最後の形だけ見せる。
// 注意: 画面に文字を入れるときは必ず textContent を使う(innerHTML は使わない)。

const COUNT_UP_MS = 1400;
const CONFETTI_COUNT = 36;
const CONFETTI_MAX_MS = 4200;
const CONFETTI_SHAPES = ["❄", "❅", "•", "✦"];

/** 「動きを減らす」設定になっているか。 */
export const prefersReducedMotion = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

const easeOut = (t) => 1 - (1 - t) ** 3;

/**
 * 数字を 0 から target まで数えあげて表示する。
 * @param {HTMLElement} element 表示する場所
 * @param {number} target 最後の数
 * @param {(n: number) => string} format 数を文字にする方法
 * @returns {Promise<void>} 数え終わったら終わる
 */
export function countUp(element, target, format = (n) => n.toLocaleString("ja-JP")) {
  if (prefersReducedMotion() || target <= 0) {
    element.textContent = format(target);
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const startedAt = performance.now();
    const step = (time) => {
      const progress = Math.min(1, (time - startedAt) / COUNT_UP_MS);
      element.textContent = format(Math.round(target * easeOut(progress)));
      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        resolve();
      }
    };
    requestAnimationFrame(step);
  });
}

const random = (min, max) => min + Math.random() * (max - min);

function confettiPiece() {
  const piece = document.createElement("span");
  piece.className = "confetti-piece";
  piece.textContent = CONFETTI_SHAPES[Math.floor(Math.random() * CONFETTI_SHAPES.length)];
  piece.style.setProperty("--x", `${random(0, 100)}vw`);
  piece.style.setProperty("--drift", `${random(-40, 40)}px`);
  piece.style.setProperty("--size", `${random(0.8, 1.8)}rem`);
  piece.style.setProperty("--delay", `${random(0, 0.8)}s`);
  piece.style.setProperty("--duration", `${random(2.4, 3.4)}s`);
  piece.style.setProperty("--hue", Math.random() < 0.3 ? "var(--gold)" : "var(--snow)");
  return piece;
}

/** 画面の上から雪の紙吹雪を降らせる(数秒で消える)。動きを減らす設定なら何もしない。 */
export function snowConfetti() {
  if (prefersReducedMotion()) return;
  const layer = document.createElement("div");
  layer.className = "confetti-layer";
  layer.setAttribute("aria-hidden", "true");
  layer.append(...Array.from({ length: CONFETTI_COUNT }, confettiPiece));
  document.body.append(layer);
  setTimeout(() => layer.remove(), CONFETTI_MAX_MS);
}
