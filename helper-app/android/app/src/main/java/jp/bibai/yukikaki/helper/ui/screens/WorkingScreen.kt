package jp.bibai.yukikaki.helper.ui.screens

import android.Manifest
import android.os.Build
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.sp
import jp.bibai.yukikaki.helper.R
import jp.bibai.yukikaki.helper.core.comparisonFor
import jp.bibai.yukikaki.helper.core.formatElapsed
import jp.bibai.yukikaki.helper.core.scoopKg
import jp.bibai.yukikaki.helper.core.teamScoops
import jp.bibai.yukikaki.helper.data.MemberRequest
import jp.bibai.yukikaki.helper.service.HelperTracker
import jp.bibai.yukikaki.helper.ui.AppDeps
import jp.bibai.yukikaki.helper.ui.ErrorText
import jp.bibai.yukikaki.helper.ui.IconLine
import jp.bibai.yukikaki.helper.ui.LabelValue
import jp.bibai.yukikaki.helper.ui.Palette
import jp.bibai.yukikaki.helper.ui.PixelButton
import jp.bibai.yukikaki.helper.ui.PixelCard
import jp.bibai.yukikaki.helper.ui.PollEffect
import jp.bibai.yukikaki.helper.ui.Screen
import jp.bibai.yukikaki.helper.ui.ScreenFrame
import jp.bibai.yukikaki.helper.ui.TestButton
import jp.bibai.yukikaki.helper.ui.TestTools
import kotlinx.coroutines.delay

private const val WORKING_POLL_MS = 3000L
private const val TICK_MS = 1000L

/** 5. 雪かき中。スコップ計はいつもオン(画面を閉じても数える)。 */
@Composable
fun WorkingScreen(deps: AppDeps, id: String, isWaitingLeaderAtFirst: Boolean, go: (Screen) -> Unit) {
    val context = LocalContext.current
    var request by remember { mutableStateOf<MemberRequest?>(null) }
    var error by remember { mutableStateOf("") }
    var isWaitingLeader by remember { mutableStateOf(isWaitingLeaderAtFirst) }
    var isSoundOn by remember { mutableStateOf(deps.prefs.isSoundOn) }
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    val tracker by HelperTracker.state.collectAsState()

    suspend fun reload(): Boolean {
        val latest = deps.api.detail(id, deps.userId)
        request = latest
        val next = movedScreen(latest, deps.userId, Screen.Working(id))
        if (next != null) {
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
    PollEffect(id, WORKING_POLL_MS) { reload() }
    LaunchedEffect(Unit) {
        while (true) {
            delay(TICK_MS)
            now = System.currentTimeMillis()
        }
    }

    // 通知の許可(と、裏で動かすための位置の許可)を求めてから、スコップ計を始める
    val permissions = buildList {
        add(Manifest.permission.ACCESS_FINE_LOCATION)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) add(Manifest.permission.POST_NOTIFICATIONS)
    }.toTypedArray()
    RequestPermissionsThen(id, permissions) { ctx -> HelperTracker.startScoops(ctx, id, deps.userId) }

    ScreenFrame("雪かき中") {
        val current = request
        if (current == null) {
            ErrorText(error)
            Text("読み込んでいます…", color = Palette.Navy)
            return@ScreenFrame
        }
        if (isWaitingLeader && !current.canFinish(deps.userId)) {
            PixelCard {
                IconLine(R.drawable.ic_hourglass, "${current.leaderName} さんが範囲を記録中…", isBold = true)
                Text("記録が終わると、自動でお疲れ様の画面へ進みます。", color = Palette.Navy)
            }
            return@ScreenFrame
        }
        val startedMs = parseIsoMs(current.startedAt)
        Text(
            if (startedMs != null) formatElapsed(now - startedMs) else "--:--",
            color = Palette.Navy,
                        fontSize = 44.sp,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )
        if (current.leaderUserId != null) {
            IconLine(
                R.drawable.ic_crown,
                if (current.leaderUserId == deps.userId) "あなたがリーダー(終わったら範囲を記録)" else "リーダー: ${current.leaderName} さん",
                isBold = true,
            )
        }
        MovedCard(current, deps.userId, tracker.scoopCount)
        PixelCard {
            LabelValue("あなた", "${format(tracker.scoopCount)}杯(約${format(scoopKg(tracker.scoopCount))}kg)")
            LabelValue("消費カロリー", "約${format(tracker.calories)}kcal")
            Text(tracker.scoopStatus.ifEmpty { "スコップ計を準備しています…" }, color = Palette.Navy)
            Text("スマホを上着のポケットに入れて、そのまま雪かきしてね。画面を閉じても数えます。", color = Palette.Navy)
        }
        ErrorText(tracker.backgroundWarning)
        Text("いっしょに: ${current.helpers.joinToString("、") { it.displayName }}", color = Palette.Navy)
        ErrorText(error)
        PixelButton(
            if (isSoundOn) "音の実況: オン" else "音の実況: オフ",
            icon = if (isSoundOn) R.drawable.ic_speaker else R.drawable.ic_mute,
            onClick = {
                isSoundOn = !isSoundOn
                deps.prefs.isSoundOn = isSoundOn
                HelperTracker.setSound(context, isSoundOn)
            },
        )
        PixelButton("雪かきを終える", isPrimary = true, onClick = {
            HelperTracker.flushScoops(context)
            if (current.canFinish(deps.userId)) go(Screen.Area(id)) else isWaitingLeader = true
        })
        TestTools { TestButton("テスト: 揺れをまねる", onClick = { HelperTracker.fakeScoop(context) }) }
    }
}

/** みんなで動かした雪 約〇kg(〇杯)と、たとえ。 */
@Composable
private fun MovedCard(request: MemberRequest, userId: String, myCount: Int) {
    val team = teamScoops(request.scoops(), userId, myCount)
    val kg = scoopKg(team)
    PixelCard {
        Text("みんなで動かした雪", color = Palette.Navy)
        Text("約${format(kg)}kg(${format(team)}杯)", color = Palette.Navy, fontSize = 26.sp)
        comparisonFor(kg)?.let { IconLine(R.drawable.ic_party, "${it.label}を超えた!", isBold = true) }
    }
}
