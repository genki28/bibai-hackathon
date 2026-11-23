package jp.bibai.yukikaki.helper.core

import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.hypot

// 範囲の記録の「筆で塗る」の計算(純粋関数)。public/liff/brush-area-core.js と同じ。
// - 筆の線は、家を原点にした m の座標(東 = x、北 = y)で持つ
// - 面積は 50cm のマス目に分けて、塗られたマスを数える(重ね塗りしても増えない)

object BrushArea {
    /** 面積を数えるマス目の 1 辺(m)。 */
    const val CELL_M = 0.5
    /** サーバーが受け付ける面積の上限(㎡)。 */
    const val MAX_AREA_M2 = 5000
    /** 筆の太さ(m)。 */
    const val THIN_WIDTH_M = 1.5
    const val THICK_WIDTH_M = 4.0
    private const val EARTH_RADIUS_M = 6_371_000.0
    private const val DEG = Math.PI / 180

    /** 緯度経度 → origin(家)からの m。狭い範囲なので平らとみなす。 */
    fun toLocalMeters(point: LatLng, origin: LatLng): Meters {
        val x = (point.lng - origin.lng) * DEG * EARTH_RADIUS_M * cos(origin.lat * DEG)
        val y = (point.lat - origin.lat) * DEG * EARTH_RADIUS_M
        return Meters(x + 0.0, y + 0.0)
    }
}

data class LatLng(val lat: Double, val lng: Double)

data class Meters(val x: Double, val y: Double)

/** 筆の 1 本の線(太さ widthM、点は家からの m)。 */
data class Stroke(val widthM: Double, val points: List<Meters>)

private fun distanceToSegment(p: Meters, a: Meters, b: Meters): Double {
    val dx = b.x - a.x
    val dy = b.y - a.y
    val lengthSq = dx * dx + dy * dy
    val t = if (lengthSq == 0.0) 0.0 else (((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq).coerceIn(0.0, 1.0)
    return hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/** 1 本の線分が塗るマスの番号の集まり。 */
private fun segmentCells(a: Meters, b: Meters, widthM: Double): Set<Pair<Int, Int>> {
    val cell = BrushArea.CELL_M
    val radius = widthM / 2
    val minX = floor((minOf(a.x, b.x) - radius) / cell).toInt()
    val maxX = ceil((maxOf(a.x, b.x) + radius) / cell).toInt()
    val minY = floor((minOf(a.y, b.y) - radius) / cell).toInt()
    val maxY = ceil((maxOf(a.y, b.y) + radius) / cell).toInt()
    return buildSet {
        for (i in minX..maxX) {
            for (j in minY..maxY) {
                // マスの真ん中が筆の中なら、そのマスは塗られたとする
                val center = Meters((i + 0.5) * cell, (j + 0.5) * cell)
                if (distanceToSegment(center, a, b) <= radius) add(i to j)
            }
        }
    }
}

private fun strokeCells(stroke: Stroke): Set<Pair<Int, Int>> {
    val points = stroke.points
    if (points.size == 1) return segmentCells(points[0], points[0], stroke.widthM)
    return points.zipWithNext { a, b -> segmentCells(a, b, stroke.widthM) }.flatten().toSet()
}

/** 筆で塗った面積(㎡)。 */
fun paintedAreaM2(strokes: List<Stroke>): Double {
    val cells = strokes.flatMap { strokeCells(it) }.toSet()
    return cells.size * BrushArea.CELL_M * BrushArea.CELL_M
}
