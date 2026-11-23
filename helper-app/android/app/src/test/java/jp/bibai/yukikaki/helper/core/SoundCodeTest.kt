package jp.bibai.yukikaki.helper.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs
import kotlin.math.roundToInt

// tests/sound-code.test.ts と同じ内容(+ 鳴らす音の波の確かめ)。
class SoundCodeTest {
    private val sampleRate = 48_000
    private val fftSize = 2048
    private val binHz = sampleRate.toDouble() / fftSize
    private val noiseDb = -100f

    private fun spectrumWith(vararg tones: Pair<Int, Float>): FloatArray {
        val spectrum = FloatArray(fftSize / 2) { noiseDb }
        tones.forEach { (hz, db) -> spectrum[(hz / binHz).roundToInt()] = db }
        return spectrum
    }

    private fun decode(symbols: List<String?>, frames: Int = SoundCode.STABLE_FRAMES + 2): List<String> {
        var state = DecoderState.EMPTY
        val codes = mutableListOf<String>()
        symbols.forEach { symbol ->
            repeat(frames) {
                val result = SoundCode.stepDecoder(state, symbol)
                state = result.state
                result.code?.let(codes::add)
            }
        }
        return codes
    }

    @Test
    fun はじめの合図のあとに4桁の数字() = assertEquals(listOf("S", "2", "7", "1", "9"), SoundCode.symbolsFor("2719"))

    @Test
    fun 数字ごとに違う周波数ではじめの合図はどの数字とも違う() {
        val all = SoundCode.SYMBOLS.map { SoundCode.frequencyOf(SoundBand.HIGH, it) }
        assertEquals(all.size, all.toSet().size)
    }

    @Test
    fun 高い音は17kHz以上() = assertTrue(SoundCode.frequencyOf(SoundBand.HIGH, "0") >= 17_000)

    @Test
    fun SPECの周波数() {
        assertEquals(18_800, SoundCode.frequencyOf(SoundBand.HIGH, "S"))
        assertEquals(17_500 + 7 * 120, SoundCode.frequencyOf(SoundBand.HIGH, "7"))
        assertEquals(2_900, SoundCode.frequencyOf(SoundBand.LOW, "S"))
        assertEquals(1_000 + 3 * 180, SoundCode.frequencyOf(SoundBand.LOW, "3"))
    }

    @Test
    fun いちばん大きい候補の周波数の記号() {
        val spectrum = spectrumWith(SoundCode.frequencyOf(SoundBand.HIGH, "7") to -40f)
        assertEquals("7", SoundCode.pickSymbol(spectrum, sampleRate, fftSize, SoundBand.HIGH))
    }

    @Test
    fun まわりの雑音と差がなければnull() {
        val spectrum = spectrumWith(SoundCode.frequencyOf(SoundBand.HIGH, "7") to noiseDb + 3)
        assertNull(SoundCode.pickSymbol(spectrum, sampleRate, fftSize, SoundBand.HIGH))
    }

    @Test
    fun 二つの候補が同じくらい大きければnull() {
        val spectrum = spectrumWith(
            SoundCode.frequencyOf(SoundBand.HIGH, "3") to -40f,
            SoundCode.frequencyOf(SoundBand.HIGH, "4") to -41f,
        )
        assertNull(SoundCode.pickSymbol(spectrum, sampleRate, fftSize, SoundBand.HIGH))
    }

    @Test
    fun 合図のあとの4桁を聞き取る() = assertEquals(listOf("2719"), decode(listOf("S", "2", "7", "1", "9")))

    @Test
    fun 合図より前の数字は使わない() =
        assertEquals(listOf("2719"), decode(listOf("1", "9", null, "S", "2", "7", "1", "9")))

    @Test
    fun 一瞬だけの記号は無視する() {
        var state = DecoderState.EMPTY
        val frames = listOf("S", "S", "S", "2", "2", "2", "5", "7", "7", "7", "1", "1", "1", "9", "9", "9")
        val codes = frames.mapNotNull { symbol ->
            SoundCode.stepDecoder(state, symbol).also { state = it.state }.code
        }
        assertEquals(listOf("2719"), codes)
    }

    @Test
    fun くり返し鳴らすとくり返し聞き取れる() = assertEquals(
        listOf("2719", "2719"),
        decode(listOf("S", "2", "7", "1", "9", null, "S", "2", "7", "1", "9")),
    )

    @Test
    fun 鳴らす波は1回1000ミリ秒で大きさは音量まで() {
        val wave = SoundCode.cycleWave("2719", SoundBand.HIGH, sampleRate)
        assertEquals(1000, SoundCode.cycleMs("2719"))
        assertEquals(sampleRate, wave.size)
        assertEquals(0f, wave[0], 0f) // なめらかに立ち上がる
        assertTrue(wave.all { abs(it) <= 0.9f + 1e-6f })
        // 最後の 300 ミリ秒は休み
        assertTrue(wave.takeLast(sampleRate * 300 / 1000).all { it == 0f })
    }
}
