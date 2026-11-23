package jp.bibai.yukikaki.helper.core

import kotlin.math.PI
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin

// 音の合言葉(スマホを近づけて到着)の決まり(純粋関数)。public/liff/sound-code.js と sound-checkin.js の playCode と同じ。
// - 合言葉(4 桁)を「はじめの合図 S → 数字 4 つ」の音の列にして、1 つずつ違う高さの音で鳴らす
// - 聞く側(お年寄りの LIFF)はスペクトルからいちばん大きい記号を選び、STABLE_FRAMES 回つづいたら「聞こえた」とする
// このアプリは鳴らす側。聞き取り(pickSymbol・stepDecoder)は Web と同じ結果になるか確かめるために移してある。

object SoundCode {
    /** 1 つの記号を鳴らす長さ(ミリ秒)と、合言葉 1 回ぶんのあとの休み(ミリ秒)。 */
    const val SYMBOL_MS = 140
    const val PAUSE_MS = 300
    /** 同じ記号がこの回数つづいたら「聞こえた」とする。 */
    const val STABLE_FRAMES = 2
    /** 音の立ち上がり・終わりをなめらかにする時間(秒)。 */
    const val RAMP_SECONDS = 0.008
    private const val MIN_ABOVE_NOISE_DB = 15.0
    private const val MIN_LEAD_DB = 6.0

    val SYMBOLS: List<String> = listOf("S", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9")

    /** 合言葉 → 鳴らす記号の列。 */
    fun symbolsFor(code: String): List<String> = listOf("S") + code.map { it.toString() }

    /** 記号 → 周波数(Hz)。 */
    fun frequencyOf(band: SoundBand, symbol: String): Int =
        if (symbol == "S") band.start else band.digitBase + symbol.toInt() * band.digitStep

    private fun levelAt(spectrum: FloatArray, binHz: Double, frequency: Int): Double {
        val center = (frequency / binHz).roundToInt()
        var level = Double.NEGATIVE_INFINITY
        for (i in center - 1..center + 1) {
            if (i >= 0 && i < spectrum.size) level = max(level, spectrum[i].toDouble())
        }
        return level
    }

    private fun noiseFloor(spectrum: FloatArray, binHz: Double, band: SoundBand): Double {
        val low = max(0, floor((band.digitBase - 400) / binHz).toInt())
        val high = min(spectrum.size - 1, kotlin.math.ceil((band.start + 400) / binHz).toInt())
        if (low > high) return Double.NEGATIVE_INFINITY
        val values = (low..high).map { spectrum[it].toDouble() }.filter { it.isFinite() }.sorted()
        return if (values.isEmpty()) Double.NEGATIVE_INFINITY else values[values.size / 2]
    }

    /** スペクトル(dB)から、いま鳴っている記号を選ぶ。決められなければ null。 */
    fun pickSymbol(spectrum: FloatArray, sampleRate: Int, fftSize: Int, band: SoundBand): String? {
        val binHz = sampleRate.toDouble() / fftSize
        val levels = SYMBOLS.map { it to levelAt(spectrum, binHz, frequencyOf(band, it)) }.sortedByDescending { it.second }
        val (best, second) = levels[0] to levels[1]
        if (best.second - noiseFloor(spectrum, binHz, band) < MIN_ABOVE_NOISE_DB) return null
        if (best.second - second.second < MIN_LEAD_DB) return null
        return best.first
    }

    /** 記号を 1 つ読み進める。合言葉が 4 桁そろったら code に入れて返す。 */
    fun stepDecoder(state: DecoderState, symbol: String?): DecoderStep {
        val run = if (symbol == state.last) state.run + 1 else 1
        val next = state.copy(last = symbol, run = run)
        if (run != STABLE_FRAMES || symbol == state.accepted) return DecoderStep(next, null)
        if (symbol == null) return DecoderStep(next.copy(accepted = null), null)
        if (symbol == "S") return DecoderStep(next.copy(accepted = symbol, digits = ""), null)
        val digitsSoFar = state.digits ?: return DecoderStep(next.copy(accepted = symbol), null)
        val digits = digitsSoFar + symbol
        if (digits.length < 4) return DecoderStep(next.copy(accepted = symbol, digits = digits), null)
        return DecoderStep(next.copy(accepted = symbol, digits = null), digits)
    }

    /** 合言葉 1 回ぶん(記号 5 つ + 休み)の長さ(ミリ秒)。 */
    fun cycleMs(code: String): Int = symbolsFor(code).size * SYMBOL_MS + PAUSE_MS

    /**
     * 合言葉 1 回ぶんの音(-1〜1 の波)。くり返し鳴らす前提で、最後に休みが入る。
     * 1 つの記号は正弦波で、はじめと終わりの RAMP_SECONDS はなめらかに大きさを変える(プツッという音を防ぐ)。
     */
    fun cycleWave(code: String, band: SoundBand, sampleRate: Int): FloatArray {
        val symbolSamples = sampleRate * SYMBOL_MS / 1000
        val rampSamples = (sampleRate * RAMP_SECONDS).roundToInt().coerceAtLeast(1)
        val total = sampleRate * cycleMs(code) / 1000
        val wave = FloatArray(total)
        symbolsFor(code).forEachIndexed { index, symbol ->
            val frequency = frequencyOf(band, symbol)
            val offset = index * symbolSamples
            for (i in 0 until symbolSamples) {
                val envelope = min(1.0, min(i.toDouble() / rampSamples, (symbolSamples - 1 - i).toDouble() / rampSamples))
                val value = band.volume * envelope * sin(2 * PI * frequency * i / sampleRate)
                wave[offset + i] = value.toFloat()
            }
        }
        return wave
    }
}

/**
 * 使う音の高さ。HIGH = 人には聞こえにくい高い音、LOW = 聞こえる音(高い音が出ない端末用)。
 * volume は鳴らす大きさ(高い音はスピーカーで小さくなりやすいので大きめ)。
 */
enum class SoundBand(val digitBase: Int, val digitStep: Int, val start: Int, val volume: Double) {
    HIGH(17_500, 120, 18_800, 0.9),
    LOW(1_000, 180, 2_900, 0.25),
}

data class DecoderState(
    val last: String? = null,
    val run: Int = 0,
    val accepted: String? = null,
    val digits: String? = null,
) {
    companion object {
        val EMPTY = DecoderState()
    }
}

data class DecoderStep(val state: DecoderState, val code: String?)
