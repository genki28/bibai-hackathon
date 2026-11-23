package jp.bibai.yukikaki.helper.ui.screens

import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import jp.bibai.yukikaki.helper.R
import jp.bibai.yukikaki.helper.data.MemberRequest
import jp.bibai.yukikaki.helper.ui.AppDeps
import jp.bibai.yukikaki.helper.ui.ErrorText
import jp.bibai.yukikaki.helper.ui.IconLine
import jp.bibai.yukikaki.helper.ui.Palette
import jp.bibai.yukikaki.helper.ui.PixelButton
import jp.bibai.yukikaki.helper.ui.PixelCard
import jp.bibai.yukikaki.helper.ui.PollEffect
import jp.bibai.yukikaki.helper.ui.Screen
import jp.bibai.yukikaki.helper.ui.ScreenFrame
import kotlinx.coroutines.launch

private const val GATHER_POLL_MS = 3000L

/** 4. 集合。参加者の名前と「〇/〇人集合」。だれかが始めたら雪かき中へ。 */
@Composable
fun GatherScreen(deps: AppDeps, id: String, go: (Screen) -> Unit) {
    var request by remember { mutableStateOf<MemberRequest?>(null) }
    var error by remember { mutableStateOf("") }
    var isBusy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    suspend fun reload(): Boolean {
        val latest = deps.api.detail(id, deps.userId)
        request = latest
        val next = movedScreen(latest, deps.userId, Screen.Gather(id))
        // まだ着いていないことになっていても、この画面からは目的地に戻さない(スキップで着いた直後など)
        if (next != null && next !is Screen.Place) {
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
    PollEffect(id, GATHER_POLL_MS) { reload() }

    ScreenFrame("集合") {
        val current = request
        if (current == null) {
            ErrorText(error)
            Text("読み込んでいます…", color = Palette.Navy)
            return@ScreenFrame
        }
        Text(
            "${current.arrivedCount}/${current.helpers.size}人集合",
            color = Palette.Navy,
            fontWeight = FontWeight.Bold,
            fontSize = 28.sp,
        )
        PixelCard {
            current.helpers.forEach { helper ->
                val name = if (helper.userId == deps.userId) "${helper.displayName}(あなた)" else helper.displayName
                IconLine(
                    if (helper.arrivedAt != null) R.drawable.ic_check else R.drawable.ic_runner,
                    if (helper.arrivedAt != null) "$name 着きました" else "$name 向かっています",
                )
            }
        }
        Text("そろったら、だれか 1 人が [雪かきを始める] を押してね。", color = Palette.Navy)
        ErrorText(error)
        PixelButton("雪かきを始める", isPrimary = true, isEnabled = !isBusy, icon = R.drawable.ic_snowman, onClick = {
            isBusy = true
            scope.launch {
                try {
                    deps.api.start(id, deps.userId)
                    go(Screen.Working(id))
                } catch (e: Exception) {
                    error = "始められませんでした: ${e.message}"
                } finally {
                    isBusy = false
                }
            }
        })
    }
}
