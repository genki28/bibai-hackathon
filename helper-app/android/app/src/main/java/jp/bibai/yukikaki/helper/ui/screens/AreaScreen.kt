package jp.bibai.yukikaki.helper.ui.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke as DrawStroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import jp.bibai.yukikaki.helper.R
import jp.bibai.yukikaki.helper.core.BrushArea
import jp.bibai.yukikaki.helper.core.LatLng
import jp.bibai.yukikaki.helper.core.Stroke
import jp.bibai.yukikaki.helper.core.paintedAreaM2
import jp.bibai.yukikaki.helper.data.MemberRequest
import jp.bibai.yukikaki.helper.service.HelperTracker
import jp.bibai.yukikaki.helper.ui.AppDeps
import jp.bibai.yukikaki.helper.ui.ErrorText
import jp.bibai.yukikaki.helper.ui.IconLine
import jp.bibai.yukikaki.helper.ui.MapMarker
import jp.bibai.yukikaki.helper.ui.OsmMap
import jp.bibai.yukikaki.helper.ui.Palette
import jp.bibai.yukikaki.helper.ui.PixelButton
import jp.bibai.yukikaki.helper.ui.PixelShape
import jp.bibai.yukikaki.helper.ui.Screen
import jp.bibai.yukikaki.helper.ui.ScreenFrame
import jp.bibai.yukikaki.helper.ui.toGeoPoint
import kotlinx.coroutines.launch
import org.osmdroid.util.TileSystem
import org.osmdroid.views.MapView
import kotlin.math.hypot
import kotlin.math.roundToInt

/** 家のまわりがよく見える拡大の度合い。 */
private const val DRAW_ZOOM = 19.0
/** 指がこれだけ動いたら、線に点を足す(画面の点)。 */
private const val MIN_POINT_GAP_PX = 4f
private val BRUSH_COLOR = Color(0xFFB73E2C).copy(alpha = 0.5f)

/** 筆の 1 本の線(緯度経度で覚える。地図を動かしても同じ場所に残る)。 */
private data class GeoStroke(val widthM: Double, val points: List<LatLng>)

/** 6. 範囲を記録。地図の上を指でなぞって筆で塗る。面積は 50cm のマス目で数える。 */
@Composable
fun AreaScreen(deps: AppDeps, id: String, go: (Screen) -> Unit) {
    val context = LocalContext.current
    var request by remember { mutableStateOf<MemberRequest?>(null) }
    var error by remember { mutableStateOf("") }
    var isBusy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(id) {
        try {
            val latest = deps.api.detail(id, deps.userId)
            request = latest
            when {
                latest.status == "done" -> go(Screen.Finish(id))
                !latest.canFinish(deps.userId) -> go(Screen.Working(id, isWaitingLeader = true))
            }
        } catch (e: Exception) {
            error = "読み込めませんでした: ${e.message}"
        }
    }

    ScreenFrame("範囲を記録", isScrollable = false) {
        val current = request
        if (current == null) {
            ErrorText(error)
            Text("読み込んでいます…", color = Palette.Navy)
            return@ScreenFrame
        }
        BrushEditor(home = current.home, error = error, isBusy = isBusy) { areaM2 ->
            isBusy = true
            scope.launch {
                try {
                    deps.api.finish(id, deps.userId, areaM2)
                    HelperTracker.stopAll(context)
                    go(Screen.Finish(id))
                } catch (e: Exception) {
                    error = "終了できませんでした: ${e.message}"
                } finally {
                    isBusy = false
                }
            }
        }
    }
}

@Composable
private fun ColumnScope.BrushEditor(home: LatLng, error: String, isBusy: Boolean, onFinish: (Int) -> Unit) {
    var strokes by remember { mutableStateOf<List<GeoStroke>>(emptyList()) }
    var drawing by remember { mutableStateOf<GeoStroke?>(null) }
    var widthM by remember { mutableStateOf(BrushArea.THIN_WIDTH_M) }
    var isBrush by remember { mutableStateOf(true) }
    var mapView by remember { mutableStateOf<MapView?>(null) }
    var mapVersion by remember { mutableIntStateOf(0) }

    val areaM2 = remember(strokes) { paintedAreaM2(strokes.map { it.toLocal(home) }).roundToInt() }
    val isTooLarge = areaM2 > BrushArea.MAX_AREA_M2

    IconLine(
        if (isBrush) R.drawable.ic_pencil else R.drawable.ic_hand,
        if (isBrush) "雪かきしたところを指でなぞって塗ってね" else "雪かきした場所まで地図を動かしてね",
    )
    Box(Modifier.fillMaxWidth().weight(1f).border(3.dp, Palette.Navy, PixelShape)) {
        OsmMap(
            center = home,
            zoom = DRAW_ZOOM,
            markers = listOf(MapMarker("home", home, R.drawable.ic_house, "ここ")),
            modifier = Modifier.matchParentSize(),
            onMapReady = { mapView = it },
            onMapMoved = { mapVersion += 1 },
        )
        val brushInput = if (isBrush) {
            Modifier.pointerInput(widthM, mapView) {
                val view = mapView ?: return@pointerInput
                awaitEachGesture {
                    val down = awaitFirstDown()
                    down.consume()
                    var last = down.position
                    var points = listOf(view.toLatLng(last))
                    drawing = GeoStroke(widthM, points)
                    while (true) {
                        val event = awaitPointerEvent()
                        val change = event.changes.firstOrNull() ?: break
                        change.consume()
                        if (!change.pressed) break
                        val position = change.position
                        if (hypot(position.x - last.x, position.y - last.y) >= MIN_POINT_GAP_PX) {
                            last = position
                            points = points + view.toLatLng(position)
                            drawing = GeoStroke(widthM, points)
                        }
                    }
                    strokes = strokes + GeoStroke(widthM, points)
                    drawing = null
                }
            }
        } else {
            Modifier
        }
        Canvas(Modifier.matchParentSize().then(brushInput)) {
            // mapVersion を読むと、地図が動くたびに描き直される
            if (mapVersion < 0) return@Canvas
            val view = mapView ?: return@Canvas
            (strokes + listOfNotNull(drawing)).forEach { drawGeoStroke(view, it) }
        }
        Text(
            if (isBrush) "筆で塗っています" else "地図を動かす",
            color = Palette.White,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.align(Alignment.TopStart).padding(8.dp)
                .background(Palette.Navy, PixelShape).padding(horizontal = 8.dp, vertical = 4.dp),
        )
    }
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text("${format(areaM2)} ㎡", color = Palette.Navy, fontWeight = FontWeight.Bold, fontSize = 26.sp, modifier = Modifier.weight(1f))
        Text("${format(BrushArea.MAX_AREA_M2)} ㎡ まで", color = Palette.Navy)
    }
    if (isTooLarge) ErrorText("広すぎます(${format(BrushArea.MAX_AREA_M2)} ㎡まで)。[1 つ戻す] で減らしてください。")
    ErrorText(error)
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        PixelButton("地図を動かす", onClick = { isBrush = false }, isPrimary = !isBrush, modifier = Modifier.weight(1f))
        PixelButton("筆で塗る", onClick = { isBrush = true }, isPrimary = isBrush, modifier = Modifier.weight(1f))
    }
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        val isThin = widthM == BrushArea.THIN_WIDTH_M
        PixelButton("細い 1.5m", onClick = { widthM = BrushArea.THIN_WIDTH_M; isBrush = true }, isPrimary = isThin, modifier = Modifier.weight(1f))
        PixelButton("太い 4m", onClick = { widthM = BrushArea.THICK_WIDTH_M; isBrush = true }, isPrimary = !isThin, modifier = Modifier.weight(1f))
    }
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        PixelButton("1 つ戻す", onClick = { strokes = strokes.dropLast(1) }, isEnabled = strokes.isNotEmpty(), modifier = Modifier.weight(1f))
        PixelButton("やり直す", onClick = { strokes = emptyList() }, isEnabled = strokes.isNotEmpty(), modifier = Modifier.weight(1f))
    }
    PixelButton(
        "雪かきを完了する",
        isPrimary = true,
        isEnabled = strokes.isNotEmpty() && !isTooLarge && !isBusy,
        icon = R.drawable.ic_check,
        onClick = { onFinish(areaM2) },
    )
}

private fun GeoStroke.toLocal(home: LatLng) = Stroke(widthM, points.map { BrushArea.toLocalMeters(it, home) })

private fun MapView.toLatLng(offset: Offset): LatLng {
    val point = projection.fromPixels(offset.x.roundToInt(), offset.y.roundToInt())
    return LatLng(point.latitude, point.longitude)
}

/** 緯度経度の線を、いまの地図の位置と拡大に合わせて描く(太さは m → 画面の点に直す)。 */
private fun DrawScope.drawGeoStroke(view: MapView, stroke: GeoStroke) {
    val projection = view.projection
    val pixels = stroke.points.map { projection.toPixels(it.toGeoPoint(), null).let { p -> Offset(p.x.toFloat(), p.y.toFloat()) } }
    val first = pixels.firstOrNull() ?: return
    val metersPerPixel = TileSystem.GroundResolution(stroke.points.first().lat, view.zoomLevelDouble)
    val widthPx = (stroke.widthM / metersPerPixel).toFloat()
    if (pixels.size == 1) {
        drawCircle(BRUSH_COLOR, radius = widthPx / 2, center = first)
        return
    }
    val path = Path().apply {
        moveTo(first.x, first.y)
        pixels.drop(1).forEach { lineTo(it.x, it.y) }
    }
    drawPath(path, BRUSH_COLOR, style = DrawStroke(width = widthPx, cap = StrokeCap.Round, join = StrokeJoin.Round))
}
