package jp.bibai.yukikaki.helper.core

import kotlin.math.exp
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.sqrt

// スコップ計の「数え方」(純粋関数)。public/liff/scoop-counter.js と同じ決まり。
// 1 サンプルずつ stepScoop で状態を進める(もとの状態は書き換えず、新しい状態を返す)。
//   1. 重力を除いた加速度を使う。重力込みの値なら、ゆっくり追いかける平均(= 重力)を引く
//   2. 揺れの大きさ √(x²+y²+z²) を、直近 SMOOTHING_SAMPLES 個の平均でなめらかにする
//   3. SCOOP_THRESHOLD を超えて山ができ、RELEASE_THRESHOLD より下がったら 1 回
//   4. 1 回数えたら MIN_SCOOP_INTERVAL_MS の間は数えない

object ScoopRules {
    /** 1 杯の重さ(kg)。 */
    const val KG_PER_SCOOP = 3.5
    /** これを超えたら「すくう動きの山」が始まった(m/s²)。 */
    const val SCOOP_THRESHOLD = 6.0
    /** 山のあと、これより下がったら 1 回と数える。 */
    const val RELEASE_THRESHOLD = 3.0
    /** 1 回数えたあと、次を数えない時間(ミリ秒)。 */
    const val MIN_SCOOP_INTERVAL_MS = 700.0
    /** なめらかにするときに平均するサンプルの数。 */
    const val SMOOTHING_SAMPLES = 5
    /** 重力を追いかける速さ(ミリ秒)。 */
    const val GRAVITY_TIME_CONSTANT_MS = 1000.0
    /** サンプルがこれより長く途切れたら、途中の値を捨ててやり直す(ミリ秒)。 */
    const val GAP_RESET_MS = 1000.0
}

data class Vec3(val x: Double, val y: Double, val z: Double) {
    val magnitude: Double get() = sqrt(x * x + y * y + z * z)
}

/** 加速度の 1 サンプル。t はミリ秒。includesGravity が true なら重力込みの値。 */
data class ScoopSample(
    val t: Double,
    val x: Double,
    val y: Double,
    val z: Double,
    val includesGravity: Boolean = false,
)

data class ScoopState(
    val count: Int = 0,
    val lastT: Double? = null,
    val gravity: Vec3? = null,
    val recent: List<Double> = emptyList(),
    val isAbove: Boolean = false,
    val lastCountAt: Double? = null,
) {
    companion object {
        val EMPTY = ScoopState()

        /** 回数だけ引き継いだ、はじめの状態(端末に覚えていた回数から続けるとき)。 */
        fun from(count: Int): ScoopState = ScoopState(count = max(0, count))
    }
}

private fun nextGravity(gravity: Vec3?, sample: ScoopSample, dt: Double): Vec3 {
    if (gravity == null) return Vec3(sample.x, sample.y, sample.z)
    val alpha = 1 - exp(-dt / ScoopRules.GRAVITY_TIME_CONSTANT_MS)
    return Vec3(
        gravity.x + alpha * (sample.x - gravity.x),
        gravity.y + alpha * (sample.y - gravity.y),
        gravity.z + alpha * (sample.z - gravity.z),
    )
}

internal fun ScoopSample.isFiniteSample(): Boolean = t.isFinite() && x.isFinite() && y.isFinite() && z.isFinite()

/** 重力を除いた揺れと、次の重力の推定(重力込みの値でなければ gravity は null)。 */
internal data class Motion(val vector: Vec3, val gravity: Vec3?) {
    val magnitude: Double get() = vector.magnitude
}

/** 1 サンプルの揺れ。重力込みの値なら、ゆっくり追いかける平均(= 重力)を引く。スコップ計とカロリーで同じものを使う。 */
internal fun motionOf(previousGravity: Vec3?, sample: ScoopSample, dt: Double): Motion {
    if (!sample.includesGravity) return Motion(Vec3(sample.x, sample.y, sample.z), null)
    val gravity = nextGravity(previousGravity, sample, dt)
    return Motion(Vec3(sample.x - gravity.x, sample.y - gravity.y, sample.z - gravity.z), gravity)
}

/** 1 サンプルぶん状態を進める。サンプルがおかしければ、もとの状態をそのまま返す。 */
fun stepScoop(state: ScoopState, sample: ScoopSample): ScoopState {
    if (!sample.isFiniteSample()) return state
    val lastT = state.lastT
    val isGap = lastT == null || sample.t - lastT > ScoopRules.GAP_RESET_MS || sample.t < lastT
    // 途切れたあとは、回数と最後に数えた時刻だけ残してやり直す
    val base = if (isGap) ScoopState.from(state.count).copy(lastCountAt = state.lastCountAt) else state
    val dt = if (isGap) 0.0 else sample.t - (lastT ?: sample.t)
    val motion = motionOf(base.gravity, sample, dt)
    val gravity = motion.gravity
    val recent = (base.recent + motion.magnitude).takeLast(ScoopRules.SMOOTHING_SAMPLES)
    val smoothed = recent.average()
    val next = base.copy(lastT = sample.t, gravity = gravity, recent = recent)

    if (!base.isAbove) return if (smoothed > ScoopRules.SCOOP_THRESHOLD) next.copy(isAbove = true) else next
    if (smoothed >= ScoopRules.RELEASE_THRESHOLD) return next
    // 山を越えて下がった。間が空いていれば 1 回と数える
    val lastCountAt = base.lastCountAt
    val isTooSoon = lastCountAt != null && sample.t - lastCountAt < ScoopRules.MIN_SCOOP_INTERVAL_MS
    if (isTooSoon) return next.copy(isAbove = false)
    return next.copy(isAbove = false, count = base.count + 1, lastCountAt = sample.t)
}

/** サンプルの列をまとめて数える(テスト・確かめ用)。 */
fun countScoops(samples: List<ScoopSample>, state: ScoopState = ScoopState.EMPTY): Int =
    samples.fold(state) { current, sample -> stepScoop(current, sample) }.count

/** すくった回数から、運んだ雪の重さ(kg。整数に丸める。JS の Math.round と同じく .5 は上へ)。 */
fun scoopKg(count: Int): Int = floor(max(0, count) * ScoopRules.KG_PER_SCOOP + 0.5).toInt()
