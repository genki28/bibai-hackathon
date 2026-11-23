package jp.bibai.yukikaki.helper.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.sin

// tests/scoop-counter.test.ts と同じ内容。作った波形で確かめる(1 秒に 60 回読む)。
class ScoopCounterTest {
    private val sampleMs = 1000.0 / 60
    private val gravity = 9.8

    private fun sampleWave(durationMs: Double, includesGravity: Boolean = false, wave: (Double) -> Vec3): List<ScoopSample> {
        val count = floor(durationMs / sampleMs).toInt()
        return List(count) { i ->
            val t = i * sampleMs
            val v = wave(t)
            ScoopSample(t, v.x, v.y, v.z, includesGravity)
        }
    }

    /** startMs から widthMs の間だけ盛り上がる山(半分の sin)。 */
    private fun pulse(t: Double, startMs: Double, widthMs: Double, height: Double): Double {
        val local = t - startMs
        return if (local in 0.0..widthMs) height * sin(PI * local / widthMs) else 0.0
    }

    /** すくう動き: 2 秒ごとに、0.4 秒の大きな揺れ(12 m/s²)が count 回。 */
    private fun scoopWave(count: Int): (Double) -> Vec3 = { t ->
        val x = (0 until count).sumOf { i -> pulse(t, 500.0 + i * 2000, 400.0, 12.0) }
        Vec3(x, 0.4 * sin(t / 37), 0.3 * cos(t / 53))
    }

    @Test
    fun すくう動きを10回すると10回と数える() {
        val samples = sampleWave(21_000.0, wave = scoopWave(10))
        assertEquals(10, countScoops(samples))
    }

    @Test
    fun 重力込みの加速度でもすくう動き10回を10回と数える() {
        val wave = scoopWave(10)
        val samples = sampleWave(21_000.0, includesGravity = true) { t -> wave(t).let { it.copy(y = it.y + gravity) } }
        assertEquals(10, countScoops(samples))
    }

    @Test
    fun 小さな揺れは数えない() {
        val samples = sampleWave(10_000.0) { t ->
            Vec3(1.2 * sin(2 * PI * 8 * t / 1000), 0.8 * cos(2 * PI * 5 * t / 1000), 0.5 * sin(2 * PI * 3 * t / 1000))
        }
        assertEquals(0, countScoops(samples))
    }

    @Test
    fun 歩く程度の揺れは数えない() {
        val samples = sampleWave(20_000.0, includesGravity = true) { t ->
            Vec3(1 * sin(2 * PI * 1 * t / 1000), gravity + 2.5 * sin(2 * PI * 2 * t / 1000), 0.6 * cos(2 * PI * 2 * t / 1000))
        }
        assertEquals(0, countScoops(samples))
    }

    @Test
    fun 押して引く1回の動きは1回と数える() {
        val samples = sampleWave(3000.0) { t -> Vec3(pulse(t, 500.0, 250.0, 12.0) - pulse(t, 800.0, 250.0, 12.0), 0.0, 0.0) }
        assertEquals(1, countScoops(samples))
        assertTrue(ScoopRules.MIN_SCOOP_INTERVAL_MS in 600.0..800.0)
    }

    @Test
    fun 回数を引き継いだ状態から数えるとその続きから増える() {
        val samples = sampleWave(7000.0, wave = scoopWave(3))
        assertEquals(45, countScoops(samples, ScoopState.from(42)))
    }

    @Test
    fun 数字でないサンプルは無視し状態を変えない() {
        val next = stepScoop(ScoopState.EMPTY, ScoopSample(0.0, Double.NaN, 0.0, 0.0))
        assertSame(ScoopState.EMPTY, next)
    }

    @Test
    fun もとの状態を書き換えない() {
        val before = ScoopState.from(5)
        val snapshot = before.copy()
        stepScoop(before, ScoopSample(0.0, 20.0, 0.0, 0.0))
        assertEquals(snapshot, before)
    }

    @Test
    fun 運んだ雪の重さは回数かける1杯の重さ() {
        assertEquals(3.5, ScoopRules.KG_PER_SCOOP, 0.0)
        assertEquals(35, scoopKg(10))
        assertEquals(0, scoopKg(0))
        assertEquals(11, scoopKg(3))
    }
}
