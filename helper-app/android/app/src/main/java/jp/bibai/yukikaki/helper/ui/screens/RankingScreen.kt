package jp.bibai.yukikaki.helper.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import jp.bibai.yukikaki.helper.R
import jp.bibai.yukikaki.helper.data.RankingEntry
import jp.bibai.yukikaki.helper.ui.AppDeps
import jp.bibai.yukikaki.helper.ui.BottomTabs
import jp.bibai.yukikaki.helper.ui.ErrorText
import jp.bibai.yukikaki.helper.ui.Palette
import jp.bibai.yukikaki.helper.ui.PixelButton
import jp.bibai.yukikaki.helper.ui.PixelCard
import jp.bibai.yukikaki.helper.ui.PixelIcon
import jp.bibai.yukikaki.helper.ui.PixelShape
import jp.bibai.yukikaki.helper.ui.Screen
import jp.bibai.yukikaki.helper.ui.ScreenFrame

/** 8. ランキング。今日 / これまでの切り替え。自分の行は目立たせる。 */
@Composable
fun RankingScreen(deps: AppDeps, go: (Screen) -> Unit) {
    var period by rememberSaveable { mutableStateOf("daily") }
    var entries by remember { mutableStateOf<List<RankingEntry>?>(null) }
    var error by remember { mutableStateOf("") }

    LaunchedEffect(period) {
        entries = null
        error = ""
        try {
            entries = deps.api.ranking(period, deps.userId)
        } catch (e: Exception) {
            error = "読み込めませんでした: ${e.message}"
        }
    }

    ScreenFrame(
        title = "ランキング",
        bottomBar = { BottomTabs(isRanking = true, onHelp = { go(Screen.HelpList) }, onRanking = {}) },
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            PixelButton("今日", onClick = { period = "daily" }, isPrimary = period == "daily", modifier = Modifier.weight(1f))
            PixelButton("これまで", onClick = { period = "total" }, isPrimary = period == "total", modifier = Modifier.weight(1f))
        }
        ErrorText(error)
        val list = entries
        when {
            list == null -> Text("読み込んでいます…", color = Palette.Navy)
            list.isEmpty() -> PixelCard { Text("まだだれもポイントを持っていません。最初の 1 人になろう!", color = Palette.Navy) }
            else -> list.forEach { RankingRow(it) }
        }
    }
}

@Composable
private fun RankingRow(entry: RankingEntry) {
    Row(
        Modifier
            .fillMaxWidth()
            .border(3.dp, Palette.Navy, PixelShape)
            .background(if (entry.isMe) Palette.Gold else Palette.White, PixelShape)
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (entry.rank == 1) PixelIcon(R.drawable.ic_crown, size = 24)
        Text("${entry.rank}位", color = Palette.Navy, fontWeight = FontWeight.Bold, modifier = Modifier.width(56.dp).padding(start = 4.dp))
        Text(
            if (entry.isMe) "${entry.displayName}(あなた)" else entry.displayName,
            color = Palette.Navy,
            fontWeight = if (entry.isMe) FontWeight.Bold else FontWeight.Normal,
            modifier = Modifier.weight(1f),
        )
        Text("${format(entry.points)} pt", color = Palette.Navy, fontWeight = FontWeight.Bold, fontSize = 17.sp)
    }
}
