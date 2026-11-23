package jp.bibai.yukikaki.helper.sound

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.util.Log
import jp.bibai.yukikaki.helper.core.SoundBand
import jp.bibai.yukikaki.helper.core.SoundCode
import kotlin.math.PI
import kotlin.math.exp
import kotlin.math.sin
import kotlin.random.Random

// 音を鳴らす(AudioTrack)。音のファイルは使わず、波をその場で作る。
// - 音の合言葉: SoundCode.cycleWave をくり返し鳴らす
// - 「ザクッ」: 短い雑音
// - ファンファーレ: ドミソド(ゲーム機のような四角い波)

private const val TAG = "Tones"
/** 高い音(18.8kHz)まで出すため、48kHz で鳴らす。 */
const val SAMPLE_RATE = 48_000

private const val SCOOP_SECONDS = 0.12
private const val SCOOP_VOLUME = 0.5
private val FANFARE_NOTES = listOf(523.0, 659.0, 784.0, 1047.0)
private const val FANFARE_NOTE_SECONDS = 0.14
private const val FANFARE_VOLUME = 0.15

/** 波(-1〜1)を 1 回 か くり返しで鳴らす AudioTrack を作る。失敗したら null。 */
private fun trackFor(wave: FloatArray, isLoop: Boolean): AudioTrack? = try {
    val track = AudioTrack.Builder()
        .setAudioAttributes(
            AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build(),
        )
        .setAudioFormat(
            AudioFormat.Builder()
                .setEncoding(AudioFormat.ENCODING_PCM_FLOAT)
                .setSampleRate(SAMPLE_RATE)
                .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                .build(),
        )
        .setTransferMode(AudioTrack.MODE_STATIC)
        .setBufferSizeInBytes(wave.size * Float.SIZE_BYTES)
        .build()
    track.write(wave, 0, wave.size, AudioTrack.WRITE_BLOCKING)
    if (isLoop) track.setLoopPoints(0, wave.size, -1)
    track
} catch (error: Exception) {
    Log.e(TAG, "音を鳴らす準備ができませんでした", error)
    null
}

/** 1 回だけ鳴らして、鳴り終わったら片付ける。 */
private fun playOnce(wave: FloatArray) {
    val track = trackFor(wave, isLoop = false) ?: return
    track.notificationMarkerPosition = wave.size
    track.setPlaybackPositionUpdateListener(object : AudioTrack.OnPlaybackPositionUpdateListener {
        override fun onMarkerReached(t: AudioTrack) = t.release()
        override fun onPeriodicNotification(t: AudioTrack) = Unit
    })
    track.play()
}

/** 音の合言葉をくり返し鳴らす。stop() で止める。 */
class CodePlayer {
    private var track: AudioTrack? = null

    fun play(code: String, band: SoundBand) {
        stop()
        track = trackFor(SoundCode.cycleWave(code, band, SAMPLE_RATE), isLoop = true)?.also { it.play() }
    }

    fun stop() {
        track?.runCatching {
            stop()
            release()
        }
        track = null
    }
}

/** 「ザクッ」の波(白い雑音を、だんだん小さくする。少しなめらかにして低めの音にする)。 */
fun scoopWave(random: Random = Random.Default): FloatArray {
    val length = (SAMPLE_RATE * SCOOP_SECONDS).toInt()
    var smoothed = 0.0
    return FloatArray(length) { i ->
        val noise = random.nextDouble(-1.0, 1.0)
        smoothed += 0.35 * (noise - smoothed)
        val envelope = exp(-6.0 * i / length)
        (SCOOP_VOLUME * envelope * smoothed * 2).toFloat().coerceIn(-1f, 1f)
    }
}

/** ファンファーレの波(ドミソド。最後の音は長め)。 */
fun fanfareWave(): FloatArray {
    val noteLength = (SAMPLE_RATE * FANFARE_NOTE_SECONDS).toInt()
    val parts = FANFARE_NOTES.mapIndexed { index, frequency ->
        val length = if (index == FANFARE_NOTES.lastIndex) noteLength * 3 else noteLength
        FloatArray(length) { i ->
            val square = if (sin(2 * PI * frequency * i / SAMPLE_RATE) >= 0) 1.0 else -1.0
            (FANFARE_VOLUME * square * exp(-5.0 * i / length)).toFloat()
        }
    }
    return parts.reduce { acc, part -> acc + part }
}

/** 効果音。 */
object Effects {
    fun scoop() = playOnce(scoopWave())
    fun fanfare() = playOnce(fanfareWave())
}
