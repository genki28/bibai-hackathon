package jp.bibai.yukikaki.helper.ui.screens

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import jp.bibai.yukikaki.helper.R
import jp.bibai.yukikaki.helper.data.PileMember
import jp.bibai.yukikaki.helper.service.HelperTracker
import jp.bibai.yukikaki.helper.sound.Effects
import jp.bibai.yukikaki.helper.ui.AppDeps
import jp.bibai.yukikaki.helper.ui.ErrorText
import jp.bibai.yukikaki.helper.ui.LabelValue
import jp.bibai.yukikaki.helper.ui.Palette
import jp.bibai.yukikaki.helper.ui.PixelButton
import jp.bibai.yukikaki.helper.ui.PixelCard
import jp.bibai.yukikaki.helper.ui.Screen
import jp.bibai.yukikaki.helper.ui.ScreenFrame
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlin.math.cos
import kotlin.math.sin
import kotlin.random.Random

private const val ROLL_MS = 1800
private const val FIREWORKS_MS = 3500
private const val RETRY_MS = 3000L
private const val MAX_RETRIES = 5

/** 一緒にやった人 1 人(kcal がわからなければ null)。 */
private data class Partner(val name: String, val calories: Int?)

/** お疲れ様の画面に出す消費カロリー。 */
private data class FinishCalories(val team: Int, val mine: Int, val partners: List<Partner>)

/**
 * 7. お疲れ様(第 3 版)。「CLEAR」+ チームの消費カロリー(大きく・数字が回る・花火・ファンファーレ)+ あなたの kcal
 * + 一緒にやった人と kcal。ポイントは出さない。演出は 1 回だけ。
 */
@Composable
fun FinishScreen(deps: AppDeps, id: String, go: (Screen) -> Unit) {
    val context = LocalContext.current
    var calories by remember { mutableStateOf<FinishCalories?>(null) }
    var error by remember { mutableStateOf("") }
    var isLoading by remember { mutableStateOf(true) }

    LaunchedEffect(id) {
        HelperTracker.stopAll(context)
        deps.prefs.markSeenFinish(id)
        // 終わった直後は、まだ全員の kcal が届いていないことがあるので、数秒あけて読み直す
        for (attempt in 1..MAX_RETRIES) {
            try {
                val latest = loadCalories(deps, id)
                if (latest != null) calories = latest
                error = ""
                if (latest != null && latest.isComplete()) break
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                error = "消費カロリーを読めませんでした: ${e.message}"
            }
            // 最初の 1 回が読めたら、ローディングを外して見せる(続きは裏で読み直す)
            if (calories != null) isLoading = false
            if (attempt < MAX_RETRIES) delay(RETRY_MS)
        }
        if (calories == null && error.isEmpty()) error = "まだ記録が届いていません。あとで「チームの記録」で見られます。"
        isLoading = false
    }

    ScreenFrame("お疲れ様", isLoading = isLoading) {
        val current = calories
        Box(Modifier.fillMaxWidth().height(180.dp), contentAlignment = Alignment.Center) {
            if (current != null) Fireworks(Modifier.fillMaxWidth().height(180.dp))
            Text("CLEAR", color = Palette.Vermilion, fontSize = 56.sp)
        }
        ErrorText(error)
        if (current != null) CaloriesView(current, deps.prefs.isSoundOn)
        PixelButton("チームの記録へ", icon = R.drawable.ic_cup, isPrimary = true, onClick = { go(Screen.Teams) })
        PixelButton("助けに行く", onClick = { go(Screen.HelpList) })
    }
}

/** チームの kcal が入っていて、一緒にやった人の kcal もそろったか。 */
private fun FinishCalories.isComplete(): Boolean = team > 0 && mine > 0 && partners.all { (it.calories ?: 0) > 0 }

/**
 * GET /api/teams/mine/{userId} の、この依頼の teamCalories と myCalories。
 * 一人ひとりの kcal は GET /api/snow-map の同じ依頼から読む(読めなければ名前だけ)。まだ記録になければ null。
 */
private suspend fun loadCalories(deps: AppDeps, id: String): FinishCalories? = coroutineScope {
    val piles = async { runCatching { deps.api.snowPiles() }.getOrNull() }
    val team = deps.api.myTeams(deps.userId).teams.firstOrNull { it.id == id } ?: return@coroutineScope null
    val pileMembers = piles.await()?.firstOrNull { it.id == id }?.members
    FinishCalories(team.teamCalories, team.myCalories, partnersOf(team.members, pileMembers, deps.prefs.displayName))
}

/** 一緒にやった人(自分の名前を 1 人ぶんだけ除く)。 */
private fun partnersOf(names: List<String>, pileMembers: List<PileMember>?, myName: String?): List<Partner> {
    val all = pileMembers?.map { Partner(it.displayName, it.calories) } ?: names.map { Partner(it, null) }
    val myIndex = all.indexOfFirst { it.name == myName }
    return if (myIndex < 0) all else all.filterIndexed { index, _ -> index != myIndex }
}

@Composable
private fun CaloriesView(calories: FinishCalories, isSoundOn: Boolean) {
    PixelCard {
        Text("チームで", color = Palette.Navy, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
        RollingKcal(calories.team, isSoundOn)
    }
    PixelCard {
        LabelValue("あなた", "${format(calories.mine)} kcal")
    }
    if (calories.partners.isNotEmpty()) {
        PixelCard {
            Text("一緒にやった人", color = Palette.Navy, fontSize = 18.sp)
            calories.partners.forEach { partner ->
                LabelValue("${partner.name} さん", partner.calories?.let { "${format(it)} kcal" } ?: "—")
            }
        }
    }
}

/** 数字が回ってから止まる(演出は 1 回だけ。値が後から増えたら、そこまで回す)。 */
@Composable
private fun RollingKcal(target: Int, isSoundOn: Boolean) {
    val roll = remember { Animatable(0f) }
    var hasPlayedFanfare by remember { mutableStateOf(false) }
    LaunchedEffect(target) {
        roll.animateTo(target.toFloat(), tween(ROLL_MS, easing = FastOutSlowInEasing))
        if (isSoundOn && !hasPlayedFanfare) Effects.fanfare()
        hasPlayedFanfare = true
    }
    Text(
        "${format(roll.value.toInt())} kcal",
        color = Palette.Vermilion,
        fontSize = 44.sp,
        textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth(),
    )
}

/** 花火の 1 つの粒。 */
private data class Spark(val burst: Int, val angle: Float, val speed: Float, val color: Color)

private val SPARK_COLORS = listOf(Palette.Gold, Palette.Vermilion, Palette.White, Palette.Gold)
private const val BURSTS = 3
private const val SPARKS_PER_BURST = 28

/** 花火(3 回はじける)。 */
@Composable
private fun Fireworks(modifier: Modifier) {
    val sparks = remember {
        val random = Random(seed = 7)
        List(BURSTS * SPARKS_PER_BURST) { i ->
            Spark(
                burst = i / SPARKS_PER_BURST,
                angle = (random.nextFloat() * 2 * Math.PI).toFloat(),
                speed = 60f + random.nextFloat() * 90f,
                color = SPARK_COLORS[i % SPARK_COLORS.size],
            )
        }
    }
    val time = remember { Animatable(0f) }
    LaunchedEffect(Unit) { time.animateTo(1f, tween(FIREWORKS_MS, easing = LinearEasing)) }
    Canvas(modifier) {
        val centers = listOf(Offset(size.width * 0.25f, size.height * 0.4f), Offset(size.width * 0.75f, size.height * 0.35f), Offset(size.width * 0.5f, size.height * 0.55f))
        sparks.forEach { spark ->
            // それぞれの花火は、少しずつ遅れてはじける
            val local = (time.value * BURSTS - spark.burst * 0.6f).coerceIn(0f, 1f)
            if (local <= 0f || local >= 1f) return@forEach
            val center = centers[spark.burst]
            val distance = spark.speed * local * density
            val fall = 30f * local * local * density
            val position = Offset(center.x + cos(spark.angle) * distance, center.y + sin(spark.angle) * distance + fall)
            drawCircle(spark.color.copy(alpha = 1f - local), radius = 4f * density, center = position)
        }
    }
}
