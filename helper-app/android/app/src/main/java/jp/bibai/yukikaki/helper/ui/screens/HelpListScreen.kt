package jp.bibai.yukikaki.helper.ui.screens

import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import jp.bibai.yukikaki.helper.R
import jp.bibai.yukikaki.helper.core.amountLabel
import jp.bibai.yukikaki.helper.data.PublicRequest
import jp.bibai.yukikaki.helper.ui.AppDeps
import jp.bibai.yukikaki.helper.ui.BottomTabs
import jp.bibai.yukikaki.helper.ui.ErrorText
import jp.bibai.yukikaki.helper.ui.Palette
import jp.bibai.yukikaki.helper.ui.PixelButton
import jp.bibai.yukikaki.helper.ui.PixelCard
import jp.bibai.yukikaki.helper.ui.PixelIcon
import jp.bibai.yukikaki.helper.ui.PollEffect
import jp.bibai.yukikaki.helper.ui.Screen
import jp.bibai.yukikaki.helper.ui.ScreenFrame
import jp.bibai.yukikaki.helper.ui.Tab
import kotlinx.coroutines.launch

private const val LIST_POLL_MS = 15_000L

/** 2. 助けに行く(一覧)。カードを押すと、そのカードが下に伸びて参加の確認が出る。 */
@Composable
fun HelpListScreen(deps: AppDeps, initialError: String, go: (Screen) -> Unit) {
    var requests by remember { mutableStateOf<List<PublicRequest>?>(null) }
    var error by remember { mutableStateOf(initialError) }
    var selectedId by remember { mutableStateOf<String?>(null) }
    var isJoining by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    suspend fun reload() {
        try {
            requests = deps.api.listOpen()
        } catch (e: Exception) {
            error = "読み込めませんでした: ${e.message}"
        }
    }
    LaunchedEffect(Unit) { reload() }
    PollEffect(Unit, LIST_POLL_MS) {
        reload()
        false
    }

    fun join(request: PublicRequest) {
        isJoining = true
        error = ""
        scope.launch {
            try {
                deps.api.join(request.id, deps.userId, deps.prefs.displayName ?: "ゲスト")
                go(nextAfterJoin(deps, request.id))
            } catch (e: Exception) {
                error = "参加できませんでした: ${e.message}"
                selectedId = null
            } finally {
                isJoining = false
            }
        }
    }

    ScreenFrame(
        title = "雪かきに参加",
        bottomBar = { BottomTabs(Tab.HELP, onHelp = {}, onTeams = { go(Screen.Teams) }) },
    ) {
        Text("${deps.prefs.displayName ?: ""} さん、雪かきを手伝える家を選んでね", color = Palette.Muted)
        ErrorText(error)
        val list = requests
        when {
            list == null -> Text("読み込んでいます…")
            list.isEmpty() -> PixelCard { Text("いまは募集がありません。また見に来てね。") }
            else -> {
                Row(verticalAlignment = Alignment.Bottom) {
                    Text("${list.size}", fontSize = 40.sp)
                    Spacer(Modifier.width(8.dp))
                    Text("件 募集中", color = Palette.Muted, modifier = Modifier.padding(bottom = 6.dp))
                }
                list.forEach { request ->
                    RequestCard(
                        request = request,
                        isOpen = selectedId == request.id,
                        isJoining = isJoining,
                        onClick = { if (!isJoining) selectedId = if (selectedId == request.id) null else request.id },
                        onJoin = { join(request) },
                        onCancel = { selectedId = null },
                    )
                }
            }
        }
        PixelButton("読み直す", onClick = { scope.launch { reload() } })
    }
}

/** 参加したあと: 本人確認がまだなら本人確認の画面、済んでいれば目的地。調べられなければ本人確認の画面へ。 */
private suspend fun nextAfterJoin(deps: AppDeps, id: String): Screen {
    val isVerified = runCatching { deps.api.isIdentityVerified(deps.userId) }.getOrDefault(false)
    return if (isVerified) Screen.Place(id) else Screen.Identity(id)
}

@Composable
private fun RequestCard(
    request: PublicRequest,
    isOpen: Boolean,
    isJoining: Boolean,
    onClick: () -> Unit,
    onJoin: () -> Unit,
    onCancel: () -> Unit,
) {
    val (label, flakes) = amountLabel(request.amount)
    PixelCard(modifier = Modifier.animateContentSize(), onClick = onClick) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(6.dp).background(Palette.Vermilion))
            Spacer(Modifier.width(8.dp))
            Text("募集中", color = Palette.Vermilion, fontSize = 14.sp)
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            PixelIcon(R.drawable.ic_house, size = 26)
            Text(request.area, fontSize = 22.sp)
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("参加 ${request.helperCount}/${request.capacity}人", color = Palette.Muted, modifier = Modifier.weight(1f))
            Text("雪 ", color = Palette.Muted)
            repeat(flakes) { PixelIcon(R.drawable.ic_snowflake, size = 16) }
            Text(" $label", color = Palette.Muted)
        }
        if (isOpen) {
            Box(Modifier.fillMaxWidth().height(2.dp).background(Palette.Navy))
            Text("この雪かきに参加しますか?", fontSize = 18.sp)
            Text("参加すると、目的地とお年寄りの名前が見えます。", color = Palette.Muted, fontSize = 14.sp)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PixelButton("やめておく", onClick = onCancel, isEnabled = !isJoining, modifier = Modifier.weight(1f))
                PixelButton(
                    if (isJoining) "参加中…" else "参加する",
                    onClick = onJoin,
                    isPrimary = true,
                    isEnabled = !isJoining,
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}
