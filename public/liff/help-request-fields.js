// 「助けを呼ぶ」フォームの入力のまとめ方(純粋関数。画面は help-request.js)。

const AMOUNTS = Object.freeze(["little", "normal", "lots"]);
const DEFAULT_AMOUNT = "normal";

/**
 * 雪の深さ(little / normal / lots)。知らない値なら「ふつう」。
 * @param {string} value
 * @returns {"little" | "normal" | "lots"}
 */
export const amountOf = (value) => (AMOUNTS.includes(value) ? value : DEFAULT_AMOUNT);

/**
 * チェックした道具を「スコップ(プラスチック)×2、ママさんダンプ×1」の形にまとめる。数が 0 や空なら数は付けない。
 * @param {ReadonlyArray<{ label: string, isChecked: boolean, count: number }>} items
 * @returns {string}
 */
export function toolsTextOf(items) {
  return items
    .filter((item) => item.isChecked)
    .map((item) => (Number.isInteger(item.count) && item.count > 0 ? `${item.label}×${item.count}` : item.label))
    .join("、");
}
