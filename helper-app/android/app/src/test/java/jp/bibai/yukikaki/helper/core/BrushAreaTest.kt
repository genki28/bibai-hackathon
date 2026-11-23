package jp.bibai.yukikaki.helper.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

// tests/brush-area-core.test.ts と同じ内容。
class BrushAreaTest {
    private val origin = LatLng(43.33, 141.853)
    private fun line(widthM: Double, vararg points: Pair<Double, Double>) = Stroke(widthM, points.map { Meters(it.first, it.second) })

    @Test
    fun 同じ点は0() = assertEquals(Meters(0.0, 0.0), BrushArea.toLocalMeters(origin, origin))

    @Test
    fun 北へ0_001度は約111m上() {
        val p = BrushArea.toLocalMeters(LatLng(origin.lat + 0.001, origin.lng), origin)
        assertEquals(0.0, p.x, 0.01)
        assertTrue(p.y > 110 && p.y < 112)
    }

    @Test
    fun 東へ進むとxが増える() {
        val p = BrushArea.toLocalMeters(LatLng(origin.lat, origin.lng + 0.001), origin)
        assertTrue(p.x > 80 && p.x < 82)
    }

    @Test
    fun 何も塗っていなければ0() = assertEquals(0.0, paintedAreaM2(emptyList()), 0.0)

    @Test
    fun 太さ2m長さ10mのまっすぐな線は約23平方メートル() {
        val area = paintedAreaM2(listOf(line(2.0, 0.0 to 0.0, 10.0 to 0.0)))
        assertTrue(area > 21 && area < 25)
    }

    @Test
    fun 同じところを2回塗っても面積は増えない() {
        val stroke = line(2.0, 0.0 to 0.0, 10.0 to 0.0)
        assertEquals(paintedAreaM2(listOf(stroke)), paintedAreaM2(listOf(stroke, stroke)), 0.01)
    }

    @Test
    fun 離れた2本の線は足し算になる() {
        val a = line(2.0, 0.0 to 0.0, 10.0 to 0.0)
        val b = line(2.0, 0.0 to 20.0, 10.0 to 20.0)
        assertEquals(paintedAreaM2(listOf(a)) * 2, paintedAreaM2(listOf(a, b)), 0.5)
    }

    @Test
    fun 一点だけ押したときも筆の丸の広さになる() {
        val area = paintedAreaM2(listOf(line(4.0, 0.0 to 0.0)))
        assertTrue(area > 11 && area < 14)
    }

    @Test
    fun マス目の細かさは50cm() = assertEquals(0.5, BrushArea.CELL_M, 0.0)
}
