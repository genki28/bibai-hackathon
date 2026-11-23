package jp.bibai.yukikaki.helper.ui.screens

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.sp
import jp.bibai.yukikaki.helper.R
import jp.bibai.yukikaki.helper.core.SoundBand
import jp.bibai.yukikaki.helper.service.HelperTracker
import jp.bibai.yukikaki.helper.sound.CodePlayer
import jp.bibai.yukikaki.helper.ui.AppDeps
import jp.bibai.yukikaki.helper.ui.ErrorText
import jp.bibai.yukikaki.helper.ui.IconLine
import jp.bibai.yukikaki.helper.ui.Palette
import jp.bibai.yukikaki.helper.ui.PixelButton
import jp.bibai.yukikaki.helper.ui.PixelCard
import jp.bibai.yukikaki.helper.ui.PollEffect
import jp.bibai.yukikaki.helper.ui.Screen
import jp.bibai.yukikaki.helper.ui.ScreenFrame
import jp.bibai.yukikaki.helper.ui.TestButton
import jp.bibai.yukikaki.helper.ui.TestTools
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** 合言葉をくり返し鳴らす時間(3 分)。 */
private const val PLAY_DURATION_MS = 3 * 60 * 1000L
private const val ARRIVAL_POLL_MS = 3000L

/** 3'. 到着(音の合言葉)。お年寄りのスマホに近づけると、音で到着が伝わる。4 桁の数字は画面にもログにも出さない。 */
@Composable
fun ArrivalScreen(deps: AppDeps, id: String, go: (Screen) -> Unit) {
    val context = LocalContext.current
    val player = remember { CodePlayer() }
    var code by remember { mutableStateOf<String?>(null) }
    var band by remember { mutableStateOf(SoundBand.HIGH) }
    var isPlaying by remember { mutableStateOf(false) }
    var playRound by remember { mutableStateOf(0) }
    var error by remember { mutableStateOf("") }
    var isBusy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    fun toGather() {
        player.stop()
        HelperTracker.stopLocation(context)
        go(Screen.Gather(id))
    }

    DisposableEffect(Unit) { onDispose { player.stop() } }

    LaunchedEffect(id) {
        try {
            code = deps.api.arrivalCode(id, deps.userId)
        } catch (e: Exception) {
            error = "合言葉を受け取れませんでした: ${e.message}"
        }
    }
    // 合言葉が届いたら・音の高さを変えたら、3 分くり返し鳴らす
    LaunchedEffect(code, band, playRound) {
        val current = code ?: return@LaunchedEffect
        player.play(current, band)
        isPlaying = true
        delay(PLAY_DURATION_MS)
        player.stop()
        isPlaying = false
    }
    // お年寄りのスマホが聞き取ったら、自分の arrivedAt が入る
    PollEffect(id, ARRIVAL_POLL_MS) {
        val latest = deps.api.detail(id, deps.userId)
        val isArrived = latest.helperOf(deps.userId)?.arrivedAt != null
        if (isArrived || latest.status == "working") toGather()
        isArrived || latest.status == "working"
    }

    ScreenFrame("到着") {
        PixelCard {
            IconLine(R.drawable.ic_phone, "お年寄りのスマホに近づけてね", isBold = true)
            IconLine(R.drawable.ic_pencil, "雪かきするエリアを確認してください")
        }
        PixelCard {
            Text(
                when {
                    code == null -> "合言葉を受け取っています…"
                    isPlaying -> "合言葉を鳴らしています"
                    else -> "音を止めました(もう一度鳴らすには、下のボタン)"
                },
                color = Palette.Navy,
                fontSize = 20.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(),
            )
            Text(
                if (band == SoundBand.HIGH) "いまは「高い音」(聞こえにくい音)です" else "いまは「聞こえる音」です",
                color = Palette.Navy,
            )
        }
        ErrorText(error)
        if (!isPlaying && code != null) PixelButton("もう一度鳴らす", onClick = { playRound += 1 })
        PixelButton(
            if (band == SoundBand.HIGH) "聞こえる音にする" else "高い音にする",
            icon = R.drawable.ic_speaker,
            onClick = { band = if (band == SoundBand.HIGH) SoundBand.LOW else SoundBand.HIGH },
        )
        PixelButton("目的地の画面にもどる", onClick = {
            player.stop()
            go(Screen.Place(id))
        })
        TestTools { TestButton("テスト: スキップして到着", isEnabled = !isBusy, onClick = {
            isBusy = true
            scope.launch {
                try {
                    deps.api.arrive(id, deps.userId)
                    toGather()
                } catch (e: Exception) {
                    error = "到着を記録できませんでした: ${e.message}"
                } finally {
                    isBusy = false
                }
            }
        }) }
    }
}
