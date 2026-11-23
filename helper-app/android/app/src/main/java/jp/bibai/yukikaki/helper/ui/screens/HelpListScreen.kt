package jp.bibai.yukikaki.helper.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.text.font.FontWeight
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
import kotlinx.coroutines.launch

private const val LIST_POLL_MS = 15_000L

/** 2. 助けに行く(一覧)。押すと確認 →「参加する」。 */
@Composable
fun HelpListScreen(deps: AppDeps, initialError: String, go: (Screen) -> Unit) {
    var requests by remember { mutableStateOf<List<PublicRequest>?>(null) }
    var error by remember { mutableStateOf(initialError) }
    var selected by remember { mutableStateOf<PublicRequest?>(null) }
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

    ScreenFrame(
        title = "助けに行く",
        bottomBar = { BottomTabs(isRanking = false, onHelp = {}, onRanking = { go(Screen.Ranking) }) },
    ) {
        Text("${deps.prefs.displayName ?: ""} さん、雪かきを手伝える家を選んでね", color = Palette.Navy)
        ErrorText(error)
        val list = requests
        when {
            list == null -> Text("読み込んでいます…", color = Palette.Navy)
            list.isEmpty() -> PixelCard { Text("いまは募集がありません。また見に来てね。", color = Palette.Navy) }
            else -> list.forEach { request -> RequestCard(request) { selected = request } }
        }
        PixelButton("読み直す", onClick = { scope.launch { reload() } })
    }

    selected?.let { request ->
        AlertDialog(
            onDismissRequest = { if (!isJoining) selected = null },
            title = { Text("この雪かきに参加しますか?") },
            text = { Text("${request.area}・雪は${amountLabel(request.amount).first}。参加すると、目的地とお年寄りの名前が見えます。") },
            confirmButton = {
                TextButton(enabled = !isJoining, onClick = {
                    isJoining = true
                    scope.launch {
                        try {
                            deps.api.join(request.id, deps.userId, deps.prefs.displayName ?: "ゲスト")
                            selected = null
                            go(Screen.Place(request.id))
                        } catch (e: Exception) {
                            error = "参加できませんでした: ${e.message}"
                            selected = null
                        } finally {
                            isJoining = false
                        }
                    }
                }) { Text("参加する", fontWeight = FontWeight.Bold) }
            },
            dismissButton = { TextButton(onClick = { selected = null }) { Text("やめる") } },
        )
    }
}

@Composable
private fun RequestCard(request: PublicRequest, onClick: () -> Unit) {
    val (label, flakes) = amountLabel(request.amount)
    PixelCard(onClick = onClick) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            PixelIcon(R.drawable.ic_house, size = 28)
            Text(request.area, color = Palette.Navy, fontWeight = FontWeight.Bold, fontSize = 20.sp)
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("雪: ", color = Palette.Navy)
            repeat(flakes) { PixelIcon(R.drawable.ic_snowflake) }
            Text(" $label", color = Palette.Navy)
        }
        Text("参加 ${request.helperCount}/${request.capacity} 人", color = Palette.Navy)
    }
}
