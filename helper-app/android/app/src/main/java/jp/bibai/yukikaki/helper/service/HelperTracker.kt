package jp.bibai.yukikaki.helper.service

import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat
import jp.bibai.yukikaki.helper.core.LatLng
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

/** 裏で動かしている仕組み(HelperService)の様子。画面はこれを見て表示する。 */
data class TrackerState(
    val requestId: String? = null,
    val isLocationOn: Boolean = false,
    val isScoopOn: Boolean = false,
    /** 自分の位置(本物かデモ)。まだなければ null。 */
    val myLocation: LatLng? = null,
    val isDemo: Boolean = false,
    val locationStatus: String = "",
    val scoopCount: Int = 0,
    /** みんなのすくった回数(自分を含む)。 */
    val teamCount: Int = 0,
    val scoopStatus: String = "",
    /** 画面を閉じると止まってしまうとき(許可がないなど)の注意。なければ空。 */
    val backgroundWarning: String = "",
)

/**
 * 画面と HelperService のつなぎ役。画面からはここの関数を呼び、様子は state で受け取る。
 * 同じアプリの中なので、様子はこの 1 つの入れ物で共有する。
 */
object HelperTracker {
    private val mutableState = MutableStateFlow(TrackerState())
    val state: StateFlow<TrackerState> = mutableState.asStateFlow()

    internal fun update(change: (TrackerState) -> TrackerState) = mutableState.update(change)

    /** 目的地の画面(3)に入ったら: 位置の共有を始める。 */
    fun startLocation(context: Context, requestId: String, userId: String, home: LatLng) =
        startService(context, HelperService.ACTION_LOCATION) {
            putExtra(HelperService.EXTRA_REQUEST_ID, requestId)
            putExtra(HelperService.EXTRA_USER_ID, userId)
            putExtra(HelperService.EXTRA_HOME_LAT, home.lat)
            putExtra(HelperService.EXTRA_HOME_LNG, home.lng)
        }

    /** 雪かき中の画面(5)に入ったら: スコップ計を始める(位置の共有は止める)。 */
    fun startScoops(context: Context, requestId: String, userId: String) =
        startService(context, HelperService.ACTION_SCOOPS) {
            putExtra(HelperService.EXTRA_REQUEST_ID, requestId)
            putExtra(HelperService.EXTRA_USER_ID, userId)
        }

    /** [デモ: 家に近づく]。 */
    fun demoStep(context: Context) = sendCommand(context, HelperService.ACTION_DEMO_STEP)

    /** [揺れをまねる]。 */
    fun fakeScoop(context: Context) = sendCommand(context, HelperService.ACTION_FAKE_SCOOP)

    /** 音の実況のオン / オフ(端末にも覚える)。 */
    fun setSound(context: Context, isOn: Boolean) =
        sendCommand(context, HelperService.ACTION_SOUND) { putExtra(HelperService.EXTRA_SOUND_ON, isOn) }

    /** いまの回数をすぐ送る(雪かきを終えるとき)。 */
    fun flushScoops(context: Context) = sendCommand(context, HelperService.ACTION_FLUSH)

    /** 到着したら位置の共有だけ止める。 */
    fun stopLocation(context: Context) = sendCommand(context, HelperService.ACTION_STOP_LOCATION)

    /** お疲れ様(7)に進んだ・参加をやめたら、すべて止める。 */
    fun stopAll(context: Context) {
        if (!mutableState.value.isLocationOn && !mutableState.value.isScoopOn) return
        sendCommand(context, HelperService.ACTION_STOP)
    }

    /** 始めるとき: フォアグラウンドサービス(通知を出し続けて、画面を閉じても動く)として起動する。 */
    private fun startService(context: Context, action: String, extras: Intent.() -> Unit) {
        val intent = Intent(context, HelperService::class.java).setAction(action).apply(extras)
        ContextCompat.startForegroundService(context, intent)
    }

    /** 動いているサービスに頼みごとをする(動いていなければ何もしない)。 */
    private fun sendCommand(context: Context, action: String, extras: Intent.() -> Unit = {}) {
        val current = mutableState.value
        if (!current.isLocationOn && !current.isScoopOn) return
        val intent = Intent(context, HelperService::class.java).setAction(action).apply(extras)
        runCatching { context.startService(intent) }
    }
}
