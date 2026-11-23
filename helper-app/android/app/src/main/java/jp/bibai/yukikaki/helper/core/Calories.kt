package jp.bibai.yukikaki.helper.core

import kotlin.math.floor

// 消費カロリーの数え方(純粋関数)。SPEC の「第 2 版の変更」6。
// 1 サンプルずつ stepCalories で状態を進める(もとの状態は書き換えず、新しい状態を返す)。
//   1. スコップ計と同じく、重力を除いた揺れの大きさを、直近 5 サンプルの平均でなめらかにする
//   2. なめらかにした揺れが ACTIVE_THRESHOLD 以上なら雪かき(5.5 METs)、小さければ立って休む(2.0 METs)
//   3. kcal += METs × 体重 60kg × 経過時間(時間)× 1.05
//   4. サンプルの間が 1 秒より空いたら、その間は数えない(途中の値も捨ててやり直す)

object CalorieRules {
    /** これ以上の揺れ(m/s²)なら、雪かきをしていると考える。 */
    const val ACTIVE_THRESHOLD = 1.5
    /** 雪かきの METs(運動の強さ)。 */
    const val ACTIVE_METS = 5.5
    /** 立って休んでいるときの METs。 */
    const val REST_METS = 2.0
    /** 体重(kg)。人によらず同じ値にする。 */
    const val BODY_KG = 60.0
    /** METs から kcal に直すときの係数。 */
    const val KCAL_FACTOR = 1.05
    /** サンプルの間がこれより空いたら、その間は数えない(ミリ秒)。 */
    const val MAX_GAP_MS = 1000.0
    /** サーバーに送れる上限(kcal)。 */
    const val MAX_CALORIES = 5000

    const val MS_PER_HOUR = 3_600_000.0
}

data class CalorieState(
    val kcal: Double = 0.0,
    val lastT: Double? = null,
    val gravity: Vec3? = null,
    val recent: List<Double> = emptyList(),
) {
    companion object {
        val EMPTY = CalorieState()

        /** kcal だけ引き継いだ、はじめの状態(端末に覚えていた値から続けるとき)。 */
        fun from(kcal: Double): CalorieState = CalorieState(kcal = if (kcal.isFinite() && kcal > 0) kcal else 0.0)
    }
}

/** なめらかにした揺れの大きさから、その間の METs。 */
fun metsFor(smoothed: Double): Double =
    if (smoothed >= CalorieRules.ACTIVE_THRESHOLD) CalorieRules.ACTIVE_METS else CalorieRules.REST_METS

/** METs と経過時間(ミリ秒)から kcal。 */
fun kcalFor(mets: Double, elapsedMs: Double): Double =
    mets * CalorieRules.BODY_KG * (elapsedMs / CalorieRules.MS_PER_HOUR) * CalorieRules.KCAL_FACTOR

/** 1 サンプルぶん状態を進める。サンプルがおかしければ、もとの状態をそのまま返す。 */
fun stepCalories(state: CalorieState, sample: ScoopSample): CalorieState {
    if (!sample.isFiniteSample()) return state
    val lastT = state.lastT
    val isGap = lastT == null || sample.t < lastT || sample.t - lastT > CalorieRules.MAX_GAP_MS
    // 途切れたあとは、kcal だけ残してやり直す(空いた時間は数えない)
    val base = if (isGap) CalorieState.from(state.kcal) else state
    val dt = if (isGap || lastT == null) 0.0 else sample.t - lastT
    val motion = motionOf(base.gravity, sample, dt)
    val recent = (base.recent + motion.magnitude).takeLast(ScoopRules.SMOOTHING_SAMPLES)
    val added = kcalFor(metsFor(recent.average()), dt)
    return CalorieState(kcal = base.kcal + added, lastT = sample.t, gravity = motion.gravity, recent = recent)
}

/** サンプルの列をまとめて数える(テスト・確かめ用)。 */
fun countCalories(samples: List<ScoopSample>, state: CalorieState = CalorieState.EMPTY): Double =
    samples.fold(state) { current, sample -> stepCalories(current, sample) }.kcal

/** サーバーに送る値(整数に丸めて 0〜5,000 に収める。.5 は上へ)。 */
fun caloriesToSend(kcal: Double): Int {
    if (!kcal.isFinite() || kcal <= 0) return 0
    return floor(kcal + 0.5).toInt().coerceIn(0, CalorieRules.MAX_CALORIES)
}
