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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import jp.bibai.yukikaki.helper.R
import jp.bibai.yukikaki.helper.core.scoopKg
import jp.bibai.yukikaki.helper.data.RequestPoints
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
import kotlinx.coroutines.delay
import kotlin.math.cos
import kotlin.math.sin
import kotlin.random.Random

private const val ROLL_MS = 1800
private const val FIREWORKS_MS = 3500
private const val RETRY_MS = 3000L
private const val MAX_RETRIES = 5

/** 7. お疲れ様。獲得ポイントを派手に(数字が回ってから止まる・花火・ファンファーレ)。 */
@Composable
fun FinishScreen(deps: AppDeps, id: String, go: (Screen) -> Unit) {
    val context = LocalContext.current
    var points by remember { mutableStateOf<RequestPoints?>(null) }
    var error by remember { mutableStateOf("") }

    LaunchedEffect(id) {
        HelperTracker.stopAll(context)
        deps.prefs.markSeenFinish(id)
        // 終わった直後は、まだ「終わっていません」と返ることがあるので、少し待って読み直す
        repeat(MAX_RETRIES) { attempt ->
            try {
                points = deps.api.points(id, deps.userId)
                error = ""
                return@LaunchedEffect
            } catch (e: Exception) {
                error = "ポイントを読めませんでした: ${e.message}"
                if (attempt < MAX_RETRIES - 1) delay(RETRY_MS)
            }
        }
    }

    ScreenFrame("お疲れ様") {
        Box(Modifier.fillMaxWidth().height(180.dp), contentAlignment = Alignment.Center) {
            if (points != null) Fireworks(Modifier.fillMaxWidth().height(180.dp))
            Text("CLEAR", color = Palette.Vermilion, fontWeight = FontWeight.Black, fontSize = 56.sp)
        }
        ErrorText(error)
        points?.let { PointsView(it, deps.prefs.isSoundOn) }
        PixelButton("ランキングへ", icon = R.drawable.ic_crown, isPrimary = true, onClick = { go(Screen.Ranking) })
        PixelButton("助けに行く", onClick = { go(Screen.HelpList) })
    }
}

@Composable
private fun PointsView(points: RequestPoints, isSoundOn: Boolean) {
    val roll = remember { Animatable(0f) }
    LaunchedEffect(points.total) {
        roll.animateTo(points.total.toFloat(), tween(ROLL_MS, easing = FastOutSlowInEasing))
        if (isSoundOn) Effects.fanfare()
    }
    PixelCard {
        Text("獲得ポイント", color = Palette.Navy, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
        Text(
            "${format(roll.value.toInt())} pt",
            color = Palette.Vermilion,
            fontWeight = FontWeight.Black,
            fontSize = 44.sp,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )
    }
    PixelCard {
        Text("内訳", color = Palette.Navy, fontWeight = FontWeight.Bold)
        LabelValue("雪かき", "${format(points.workPoints)} pt")
        LabelValue("評価", points.stars?.let { "${format(points.ratingPoints)} pt(星 $it)" } ?: "まだ届いていません")
        LabelValue(
            "再会",
            if (points.reunionPoints > 0) "${format(points.reunionPoints)} pt(${points.reunionPartners.joinToString("、")}さんと再会!)" else "なし",
        )
        LabelValue("初回ボーナス", "${format(points.firstFinishBonus)} pt")
    }
    PixelCard {
        Text("スコップの回数", color = Palette.Navy, fontWeight = FontWeight.Bold)
        LabelValue("あなた", "${format(points.myScoops)} 振り(約 ${format(scoopKg(points.myScoops))} kg)")
        LabelValue("みんな", "${format(points.totalScoops)} 振り(約 ${format(scoopKg(points.totalScoops))} kg)")
    }
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
