// 「浮いたジム代」の計算(純粋な関数。画面やブラウザの機能は使わない)。
// 雪かきの時間を、ジムで同じ時間だけ運動したときのお金に置きかえる。
// テストは tests/gym-fee.test.ts。

/** 一般的なジム代の目安(1 時間あたり・円)。都度払いのジムの 1 回分くらい。 */
export const GYM_FEE_PER_HOUR_YEN = 1000;

/** 金額を丸める単位(円)。 */
const ROUND_YEN = 10;
const MINUTES_PER_HOUR = 60;

/**
 * 浮いたジム代(円)= 雪かきの時間(分)× 1 時間あたりのジム代。10 円単位に四捨五入。
 * @param {number} minutes 雪かきの時間(分)
 * @returns {number}
 */
export function savedGymFeeYen(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return 0;
  const yen = (minutes / MINUTES_PER_HOUR) * GYM_FEE_PER_HOUR_YEN;
  return Math.round(yen / ROUND_YEN) * ROUND_YEN;
}
