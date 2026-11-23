package jp.bibai.yukikaki.helper.ui.screens

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import jp.bibai.yukikaki.helper.R
import jp.bibai.yukikaki.helper.data.MyTeams
import jp.bibai.yukikaki.helper.data.TeamRecord
import jp.bibai.yukikaki.helper.ui.AppDeps
import jp.bibai.yukikaki.helper.ui.BottomTabs
import jp.bibai.yukikaki.helper.ui.ErrorText
import jp.bibai.yukikaki.helper.ui.LabelValue
import jp.bibai.yukikaki.helper.ui.Palette
import jp.bibai.yukikaki.helper.ui.PixelButton
import jp.bibai.yukikaki.helper.ui.PixelCard
import jp.bibai.yukikaki.helper.ui.Screen
import jp.bibai.yukikaki.helper.ui.ScreenFrame
import jp.bibai.yukikaki.helper.ui.Tab
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

private val DATE_FORMAT: DateTimeFormatter = DateTimeFormatter.ofPattern("M月d日 H:mm")

/** ISO の時刻 → 「11月23日 13:05」(端末の時間帯)。読めなければ「—」。 */
fun formatTeamDate(iso: String?): String {
    val instant = iso?.let { runCatching { Instant.parse(it) }.getOrNull() } ?: return "—"
    return DATE_FORMAT.format(instant.atZone(ZoneId.systemDefault()))
}

/** 8. チームの記録(ランキングの代わり)。GET /api/teams/mine/{userId}。 */
@Composable
fun TeamsScreen(deps: AppDeps, go: (Screen) -> Unit) {
    val context = LocalContext.current
    var teams by remember { mutableStateOf<MyTeams?>(null) }
    var error by remember { mutableStateOf("") }

    LaunchedEffect(Unit) {
        try {
            teams = deps.api.myTeams(deps.userId)
        } catch (e: Exception) {
            error = "読み込めませんでした: ${e.message}"
        }
    }

    ScreenFrame(
        title = "チームの記録",
        bottomBar = { BottomTabs(Tab.TEAMS, onHelp = { go(Screen.HelpList) }, onTeams = {}) },
    ) {
        ErrorText(error)
        val current = teams
        when {
            current == null && error.isEmpty() -> Text("読み込んでいます…")
            current != null -> TeamsSummary(current)
        }
        PixelButton("美唄の雪山マップを見る", icon = R.drawable.ic_pin, onClick = {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse("${deps.api.baseUrl}/snow-map.html"))
            try {
                context.startActivity(intent)
            } catch (e: ActivityNotFoundException) {
                error = "ブラウザを開けませんでした"
            }
        })
    }
}

@Composable
private fun TeamsSummary(teams: MyTeams) {
    PixelCard {
        Text("あなたのチームで", color = Palette.Muted)
        Row(verticalAlignment = Alignment.Bottom) {
            Text("合計 ", fontSize = 18.sp, modifier = Modifier.padding(bottom = 6.dp))
            Text(format(teams.totalCalories), color = Palette.Vermilion, fontSize = 44.sp)
            Spacer(Modifier.width(6.dp))
            Text("kcal", fontSize = 18.sp, modifier = Modifier.padding(bottom = 6.dp))
        }
        Text("${format(teams.teamCount)}回 ・ ${format(teams.partners)}人といっしょに", color = Palette.Navy)
    }
    if (teams.teams.isEmpty()) {
        PixelCard { Text("まだ記録がありません。雪かきに参加すると、ここにチームの記録が残ります。") }
        return
    }
    teams.teams.forEach { TeamCard(it) }
}

@Composable
private fun TeamCard(team: TeamRecord) {
    PixelCard {
        Text(formatTeamDate(team.finishedAt), color = Palette.Muted, fontSize = 14.sp)
        Text(team.area, fontSize = 20.sp)
        Text("いっしょに: ${team.members.joinToString("、").ifEmpty { "—" }}", color = Palette.Navy)
        LabelValue("チーム", "${format(team.teamCalories)} kcal")
        LabelValue("あなた", "${format(team.myCalories)} kcal")
    }
}
