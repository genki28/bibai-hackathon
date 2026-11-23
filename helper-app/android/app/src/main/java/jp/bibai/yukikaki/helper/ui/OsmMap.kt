package jp.bibai.yukikaki.helper.ui

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.graphics.drawable.BitmapDrawable
import androidx.annotation.DrawableRes
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import jp.bibai.yukikaki.helper.core.LatLng
import org.osmdroid.events.MapListener
import org.osmdroid.events.ScrollEvent
import org.osmdroid.events.ZoomEvent
import org.osmdroid.tileprovider.tilesource.TileSourceFactory
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.CustomZoomButtonsController
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.Marker

// osmdroid(OpenStreetMap。鍵の要らない地図)を Compose の中に出す。

/** 地図の上のしるし(アイコンの下に短い文字)。 */
data class MapMarker(val id: String, val point: LatLng, @param:DrawableRes val icon: Int, val label: String)

fun LatLng.toGeoPoint() = GeoPoint(lat, lng)

/**
 * 地図。markers が変わるとしるしを置き直す。
 * onMapReady で MapView を受け取れる(筆の画面で、画面の点 ⇄ 緯度経度の変換に使う)。
 * onMapMoved は地図を動かした・拡大したときに呼ぶ(重ねた絵を描き直すため)。
 */
@Composable
fun OsmMap(
    center: LatLng,
    zoom: Double,
    markers: List<MapMarker>,
    modifier: Modifier = Modifier,
    onMapReady: (MapView) -> Unit = {},
    onMapMoved: () -> Unit = {},
) {
    val context = LocalContext.current
    val moved = rememberUpdatedState(onMapMoved)
    val mapView = remember {
        MapView(context).apply {
            setTileSource(TileSourceFactory.MAPNIK)
            setMultiTouchControls(true)
            zoomController.setVisibility(CustomZoomButtonsController.Visibility.NEVER)
            controller.setZoom(zoom)
            controller.setCenter(center.toGeoPoint())
            addMapListener(object : MapListener {
                override fun onScroll(event: ScrollEvent?): Boolean {
                    moved.value()
                    return false
                }

                override fun onZoom(event: ZoomEvent?): Boolean {
                    moved.value()
                    return false
                }
            })
        }
    }
    MapLifecycle(mapView)
    AndroidView(
        factory = { mapView.also(onMapReady) },
        modifier = modifier,
        update = { view -> placeMarkers(view, markers) },
    )
}

/** 画面が隠れたら地図も止める(電池を使いすぎないように)。 */
@Composable
private fun MapLifecycle(mapView: MapView) {
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    DisposableEffect(lifecycle, mapView) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_RESUME -> mapView.onResume()
                Lifecycle.Event.ON_PAUSE -> mapView.onPause()
                else -> Unit
            }
        }
        lifecycle.addObserver(observer)
        onDispose {
            lifecycle.removeObserver(observer)
            mapView.onDetach()
        }
    }
}

/**
 * しるしを置く。同じ id のしるしは作り直さず、位置だけ動かす(絵は id・アイコン・文字が変わったときだけ作る)。
 * 位置が変わるたびにビットマップを作り直すと重いので、MapView の tag に覚えておく。
 */
private fun placeMarkers(view: MapView, markers: List<MapMarker>) {
    @Suppress("UNCHECKED_CAST")
    val placed = (view.tag as? MutableMap<String, Pair<MapMarker, Marker>>) ?: mutableMapOf<String, Pair<MapMarker, Marker>>().also { view.tag = it }
    var isChanged = false
    val wantedIds = markers.map { it.id }.toSet()
    placed.keys.filter { it !in wantedIds }.forEach { id ->
        placed.remove(id)?.let { (_, marker) -> view.overlays.remove(marker) }
        isChanged = true
    }
    markers.forEach { item ->
        val existing = placed[item.id]
        if (existing != null && existing.first == item) return@forEach
        val marker = existing?.second ?: Marker(view).apply {
            setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM)
            setInfoWindow(null)
            view.overlays.add(this)
        }
        val previous = existing?.first
        if (previous == null || previous.icon != item.icon || previous.label != item.label) {
            marker.icon = labeledIcon(view.context, item.icon, item.label)
            marker.title = item.label
        }
        marker.position = item.point.toGeoPoint()
        placed[item.id] = item to marker
        isChanged = true
    }
    if (isChanged) view.invalidate()
}

/** アイコンの下に文字の札を付けた絵を作る(地図のしるし用)。 */
private fun labeledIcon(context: Context, @DrawableRes iconRes: Int, label: String): BitmapDrawable {
    val density = context.resources.displayMetrics.density
    val iconPx = (32 * density).toInt()
    val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFF192E49.toInt()
        textSize = 13 * density
        typeface = Typeface.DEFAULT_BOLD
    }
    val padding = 4 * density
    val textWidth = textPaint.measureText(label)
    val labelHeight = textPaint.textSize + padding * 2
    val width = maxOf(iconPx.toFloat(), textWidth + padding * 2).toInt()
    val height = (iconPx + labelHeight).toInt()
    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    ContextCompat.getDrawable(context, iconRes)?.let { drawable ->
        val left = (width - iconPx) / 2
        drawable.setBounds(left, 0, left + iconPx, iconPx)
        drawable.draw(canvas)
    }
    val box = RectF((width - textWidth) / 2 - padding, iconPx.toFloat(), (width + textWidth) / 2 + padding, height.toFloat())
    canvas.drawRect(box, Paint().apply { color = 0xFFFFFFFF.toInt() })
    canvas.drawRect(box, Paint().apply { color = 0xFF192E49.toInt(); style = Paint.Style.STROKE; strokeWidth = 2 * density })
    canvas.drawText(label, (width - textWidth) / 2, iconPx + padding + textPaint.textSize * 0.85f, textPaint)
    return BitmapDrawable(context.resources, bitmap)
}
