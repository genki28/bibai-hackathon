package jp.bibai.yukikaki.helper.core

import org.junit.Assert.assertEquals
import org.junit.Test

// 消費カロリーの数え方(SPEC の「第 2 版の変更」6)を確かめる。1 秒に 50 回読む。
class CaloriesTest {
    private val sampleMs = 20.0
    private val delta = 1e-6

    /** startMs から durationMs の間、揺れの大きさがずっと magnitude のサンプル(x だけ動かす)。 */
    private fun steady(magnitude: Double, durationMs: Double, startMs: Double = 0.0): List<ScoopSample> {
        val count = (durationMs / sampleMs).toInt()
        return List(count + 1) { i -> ScoopSample(startMs + i * sampleMs, magnitude, 0.0, 0.0) }
    }

    @Test
    fun 揺れが大きいまま1分なら雪かきの5_5METsで数える() {
        // 5.5 × 60kg × (1/60 時間) × 1.05 = 5.775
        assertEquals(5.775, countCalories(steady(3.0, 60_000.0)), delta)
    }

    @Test
    fun 揺れが小さいまま1分なら立って休む2_0METsで数える() {
        // 2.0 × 60kg × (1/60 時間) × 1.05 = 2.1
        assertEquals(2.1, countCalories(steady(0.5, 60_000.0)), delta)
    }

    @Test
    fun 境目の1_5ちょうどは雪かきとして数え_少し下は休みとして数える() {
        assertEquals(5.775, countCalories(steady(1.5, 60_000.0)), delta)
        assertEquals(2.1, countCalories(steady(1.49, 60_000.0)), delta)
    }

    @Test
    fun 体重60kgと係数1_05で1時間の雪かきは346_5kcal() {
        assertEquals(346.5, kcalFor(CalorieRules.ACTIVE_METS, CalorieRules.MS_PER_HOUR), delta)
        assertEquals(126.0, kcalFor(CalorieRules.REST_METS, CalorieRules.MS_PER_HOUR), delta)
    }

    @Test
    fun サンプルの間が1秒より空いたらその間は数えない() {
        // 30 秒 + (5 秒の空き) + 30 秒 → 60 秒ぶんだけ
        val samples = steady(3.0, 30_000.0) + steady(3.0, 30_000.0, startMs = 35_000.0)
        assertEquals(5.775, countCalories(samples), delta)
    }

    @Test
    fun サンプルの間がちょうど1秒なら数える() {
        val samples = listOf(ScoopSample(0.0, 3.0, 0.0, 0.0), ScoopSample(1000.0, 3.0, 0.0, 0.0))
        assertEquals(kcalFor(CalorieRules.ACTIVE_METS, 1000.0), countCalories(samples), delta)
    }

    @Test
    fun 揺れは5サンプルの平均でなめらかにするので_1回だけの大きな揺れは休みのまま() {
        // 0 が 4 つのあとに 5.0 が 1 つ → 平均 1.0(1.5 より小さい)
        val samples = List(5) { i -> ScoopSample(i * sampleMs, if (i == 4) 5.0 else 0.0, 0.0, 0.0) }
        assertEquals(kcalFor(CalorieRules.REST_METS, 4 * sampleMs), countCalories(samples), delta)
    }

    @Test
    fun 重力込みの値でも_止まっていれば休みとして数える() {
        val samples = List(3001) { i -> ScoopSample(i * sampleMs, 0.0, 0.0, 9.81, includesGravity = true) }
        assertEquals(2.1, countCalories(samples), delta)
    }

    @Test
    fun 前の値から続けて数えられ_もとの状態は変わらない() {
        val start = CalorieState.from(10.0)
        val next = stepCalories(stepCalories(start, ScoopSample(0.0, 3.0, 0.0, 0.0)), ScoopSample(20.0, 3.0, 0.0, 0.0))
        assertEquals(10.0, start.kcal, delta)
        assertEquals(10.0 + kcalFor(CalorieRules.ACTIVE_METS, 20.0), next.kcal, delta)
    }

    @Test
    fun おかしなサンプルは無視する() {
        val state = stepCalories(CalorieState.EMPTY, ScoopSample(0.0, 3.0, 0.0, 0.0))
        assertEquals(state, stepCalories(state, ScoopSample(Double.NaN, 3.0, 0.0, 0.0)))
    }

    @Test
    fun 送る値は整数に丸めて0から5000に収める() {
        assertEquals(0, caloriesToSend(-3.0))
        assertEquals(0, caloriesToSend(Double.NaN))
        assertEquals(2, caloriesToSend(2.4))
        assertEquals(3, caloriesToSend(2.5))
        assertEquals(5000, caloriesToSend(9999.0))
    }
}
