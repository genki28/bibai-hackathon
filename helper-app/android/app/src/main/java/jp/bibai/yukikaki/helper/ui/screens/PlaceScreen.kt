package jp.bibai.yukikaki.helper.ui.screens

import androidx.compose.foundation.border
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import jp.bibai.yukikaki.helper.R
import jp.bibai.yukikaki.helper.core.amountLabel
import jp.bibai.yukikaki.helper.data.MemberRequest
import jp.bibai.yukikaki.helper.service.HelperTracker
import jp.bibai.yukikaki.helper.ui.AppDeps
import jp.bibai.yukikaki.helper.ui.ErrorText
import jp.bibai.yukikaki.helper.ui.IconLine
import jp.bibai.yukikaki.helper.ui.LabelValue
import jp.bibai.yukikaki.helper.ui.MapMarker
import jp.bibai.yukikaki.helper.ui.OsmMap
import jp.bibai.yukikaki.helper.ui.Palette
import jp.bibai.yukikaki.helper.ui.PixelButton
import jp.bibai.yukikaki.helper.ui.PixelCard
import jp.bibai.yukikaki.helper.ui.PixelShape
import jp.bibai.yukikaki.helper.ui.PollEffect
import jp.bibai.yukikaki.helper.ui.Screen
import jp.bibai.yukikaki.helper.ui.ScreenFrame
import jp.bibai.yukikaki.helper.ui.TestButton
import jp.bibai.yukikaki.helper.ui.TestTools
import kotlinx.coroutines.launch

private const val PLACE_POLL_MS = 5000L
private const val PLACE_ZOOM = 15.0

/** 3. 目的地。地図に家「ここ」と自分「あなた」。位置の共有はいつもオン(画面を閉じても続ける)。 */
@Composable
fun PlaceScreen(deps: AppDeps, id: String, go: (Screen) -> Unit) {
    val context = LocalContext.current
    var request by remember { mutableStateOf<MemberRequest?>(null) }
    var error by remember { mutableStateOf("") }
    var isBusy by remember { mutableStateOf(false) }
    val tracker by HelperTracker.state.collectAsState()
    val scope = rememberCoroutineScope()

    suspend fun reload(): Boolean {
        val latest = deps.api.detail(id, deps.userId)
        request = latest
        val next = movedScreen(latest, deps.userId, Screen.Place(id))
        if (next != null) {
            if (next is Screen.HelpList) HelperTracker.stopAll(context)
            go(next)
            return true
        }
        return false
    }

    LaunchedEffect(id) {
        try {
            reload()
        } catch (e: Exception) {
            error = "読み込めませんでした: ${e.message}"
        }
    }
    PollEffect(id, PLACE_POLL_MS) { reload() }

    // 位置の許可(と通知の許可)を求めてから、位置の共有を始める
    val home = request?.home
    if (home != null) {
        RequestPermissionsThen(id, trackingPermissions()) { ctx ->
            HelperTracker.startLocation(ctx, id, deps.userId, home)
        }
    }

    ScreenFrame("目的地") {
        val current = request
        if (current == null) {
            ErrorText(error)
            Text("読み込んでいます…", color = Palette.Navy)
            return@ScreenFrame
        }
        val markers = buildList {
            add(MapMarker("home", current.home, R.drawable.ic_house, "ここ"))
            tracker.myLocation?.let { add(MapMarker("me", it, R.drawable.ic_runner, "あなた")) }
        }
        OsmMap(
            center = current.home,
            zoom = PLACE_ZOOM,
            markers = markers,
            modifier = Modifier.fillMaxWidth().height(280.dp).border(3.dp, Palette.Navy, PixelShape),
        )
        IconLine(R.drawable.ic_pin, tracker.locationStatus.ifEmpty { "位置の共有を準備しています…" })
        ErrorText(tracker.backgroundWarning)
        PixelCard {
            Text(current.address ?: current.area, color = Palette.Navy, fontSize = 18.sp)
            LabelValue("募集した人", current.name?.let { "$it さん" } ?: "—")
            LabelValue("雪の多さ", amountLabel(current.amount).first)
            LabelValue("道具", current.tools ?: "—")
            LabelValue("参加", "${current.helpers.size}/${current.capacity} 人")
        }
        ErrorText(error)
        PixelButton("到着しました", icon = R.drawable.ic_check, isPrimary = true, onClick = { go(Screen.Arrival(id)) })
        PixelButton("参加をやめる", isEnabled = !isBusy, onClick = {
            isBusy = true
            scope.launch {
                try {
                    deps.api.leave(id, deps.userId)
                    HelperTracker.stopAll(context)
                    go(Screen.HelpList)
                } catch (e: Exception) {
                    error = "参加をやめられませんでした: ${e.message}"
                } finally {
                    isBusy = false
                }
            }
        })
        TestTools { TestButton("テスト: 家に近づく", onClick = { HelperTracker.demoStep(context) }) }
    }
}
