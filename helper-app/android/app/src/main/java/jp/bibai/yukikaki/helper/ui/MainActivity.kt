package jp.bibai.yukikaki.helper.ui

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import jp.bibai.yukikaki.helper.core.ResumeTarget
import jp.bibai.yukikaki.helper.core.resumeTargetFor
import jp.bibai.yukikaki.helper.data.ApiClient
import jp.bibai.yukikaki.helper.data.Prefs
import jp.bibai.yukikaki.helper.ui.screens.AreaScreen
import jp.bibai.yukikaki.helper.ui.screens.ArrivalScreen
import jp.bibai.yukikaki.helper.ui.screens.FinishScreen
import jp.bibai.yukikaki.helper.ui.screens.GatherScreen
import jp.bibai.yukikaki.helper.ui.screens.HelpListScreen
import jp.bibai.yukikaki.helper.ui.screens.IdentityScreen
import jp.bibai.yukikaki.helper.ui.screens.OnboardingScreen
import jp.bibai.yukikaki.helper.ui.screens.PlaceScreen
import jp.bibai.yukikaki.helper.ui.screens.TeamsScreen
import jp.bibai.yukikaki.helper.ui.screens.WorkingScreen
import org.osmdroid.config.Configuration

/** 画面の一覧(SPEC の 1〜8。8 は第 2 版で「チームの記録」に変えた)。依頼の画面は依頼 ID を持つ。 */
sealed interface Screen {
    data object Resume : Screen
    data object Onboarding : Screen
    data object HelpList : Screen
    data object Teams : Screen
    /** 本人確認(参加したあと、まだ確認していなければ)。 */
    data class Identity(val id: String) : Screen
    data class Place(val id: String) : Screen
    data class Arrival(val id: String) : Screen
    data class Gather(val id: String) : Screen
    data class Working(val id: String, val isWaitingLeader: Boolean = false) : Screen
    data class Area(val id: String) : Screen
    data class Finish(val id: String) : Screen
}

/** 画面が使う道具(API・端末の保存・自分の ID)。 */
class AppDeps(val api: ApiClient, val prefs: Prefs) {
    val userId: String = prefs.userId
}

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // 地図(OpenStreetMap)の決まり: アプリの名前を名乗って地図の画像を読む
        Configuration.getInstance().apply {
            load(applicationContext, getSharedPreferences("osmdroid", MODE_PRIVATE))
            userAgentValue = packageName
        }
        setContent {
            HelperTheme { HelperApp() }
        }
    }
}

@Composable
private fun HelperApp() {
    val context = LocalContext.current
    val deps = remember { AppDeps(ApiClient(), Prefs(context)) }
    var screen: Screen by remember { mutableStateOf(if (deps.prefs.displayName == null) Screen.Onboarding else Screen.Resume) }
    var resumeError by rememberSaveable { mutableStateOf("") }
    val go: (Screen) -> Unit = { screen = it }

    // 戻るボタン: 依頼の途中の画面は、一覧に戻らないようにする(続きは「アプリを開き直す」で戻れる)
    BackHandler(enabled = screen is Screen.Teams || screen is Screen.Arrival || screen is Screen.Area) {
        screen = when (val current = screen) {
            is Screen.Arrival -> Screen.Place(current.id)
            is Screen.Area -> Screen.Working(current.id)
            else -> Screen.HelpList
        }
    }

    when (val current = screen) {
        Screen.Resume -> {
            LoadingBox("続きを調べています…")
            LaunchedEffect(Unit) {
                resumeError = ""
                screen = try {
                    resumeScreen(deps)
                } catch (error: Exception) {
                    resumeError = "続きを調べられませんでした: ${error.message}"
                    Screen.HelpList
                }
            }
        }
        Screen.Onboarding -> OnboardingScreen(deps) { screen = Screen.Resume }
        Screen.HelpList -> HelpListScreen(deps, resumeError, go)
        Screen.Teams -> TeamsScreen(deps, go)
        is Screen.Identity -> IdentityScreen(deps, current.id, go)
        is Screen.Place -> PlaceScreen(deps, current.id, go)
        is Screen.Arrival -> ArrivalScreen(deps, current.id, go)
        is Screen.Gather -> GatherScreen(deps, current.id, go)
        is Screen.Working -> WorkingScreen(deps, current.id, current.isWaitingLeader, go)
        is Screen.Area -> AreaScreen(deps, current.id, go)
        is Screen.Finish -> FinishScreen(deps, current.id, go)
    }
}

/** GET /api/help-requests/active/{userId} で続きがあるか調べ、戻る画面を決める。 */
private suspend fun resumeScreen(deps: AppDeps): Screen {
    val active = deps.api.active(deps.userId) ?: return Screen.HelpList
    val me = active.helperOf(deps.userId)
    val target = resumeTargetFor(active.status, me != null, me?.arrivedAt, deps.prefs.hasSeenFinish(active.id))
    return when (target) {
        ResumeTarget.PLACE -> Screen.Place(active.id)
        ResumeTarget.GATHER -> Screen.Gather(active.id)
        ResumeTarget.WORKING -> Screen.Working(active.id)
        ResumeTarget.FINISH -> Screen.Finish(active.id)
        null -> Screen.HelpList
    }
}
