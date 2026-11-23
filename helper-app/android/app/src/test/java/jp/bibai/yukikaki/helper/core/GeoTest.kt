package jp.bibai.yukikaki.helper.core

import jp.bibai.yukikaki.helper.data.ApiClient
import jp.bibai.yukikaki.helper.data.ApiException
import jp.bibai.yukikaki.helper.data.newUserId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Random

// tests/eta.test.ts の距離・到着の目安・デモの近づき方と、位置を送る間隔・続きの画面・利用者 ID・API の返事。
class GeoTest {
    private val home = LatLng(43.33, 141.853)

    @Test
    fun 緯度が0_01度ちがうとおよそ1112m() {
        val meters = Geo.distanceM(home, LatLng(home.lat + 0.01, home.lng))
        assertTrue(meters > 1100 && meters < 1125)
    }

    @Test
    fun 同じ点なら0m() = assertEquals(0.0, Geo.distanceM(home, home), 0.0)

    @Test
    fun 到着の目安は80m毎分で切り上げ最低1分() {
        assertEquals(5, Geo.etaMinutes(400.0))
        assertEquals(6, Geo.etaMinutes(401.0))
        assertEquals(1, Geo.etaMinutes(0.0))
    }

    @Test
    fun 百五十m近づくと残りの距離が150m減る() {
        val from = LatLng(home.lat - 0.01, home.lng)
        val before = Geo.distanceM(from, home)
        val next = Geo.stepToward(from, home, 150.0)
        assertEquals(150.0, before - Geo.distanceM(next, home), 0.5)
    }

    @Test
    fun 残りが近づく距離より短ければちょうど家に着く() =
        assertEquals(home, Geo.stepToward(LatLng(home.lat + 0.0005, home.lng), home, 150.0))

    @Test
    fun デモの最初の位置は家から南西へ約1km() {
        val start = Geo.demoStart(home)
        assertEquals(home.lat - 0.006, start.lat, 1e-9)
        assertEquals(home.lng - 0.008, start.lng, 1e-9)
        val meters = Geo.distanceM(start, home)
        assertTrue(meters > 850 && meters < 1100)
    }

    @Test
    fun 位置はまだ送っていないか10m以上動いたか60秒たったら送る() {
        val sent = SentPoint(home, 0)
        assertTrue(Geo.shouldSend(home, 0, null))
        assertFalse(Geo.shouldSend(LatLng(home.lat + 0.00005, home.lng), 15_000, sent)) // 約 5.6m
        assertTrue(Geo.shouldSend(LatLng(home.lat + 0.0001, home.lng), 15_000, sent)) // 約 11m
        assertTrue(Geo.shouldSend(home, 60_000, sent))
    }

    @Test
    fun 続きの画面は状態と到着で決まる() {
        assertEquals(ResumeTarget.PLACE, resumeTargetFor("accepted", true, null, false))
        assertEquals(ResumeTarget.GATHER, resumeTargetFor("accepted", true, "2026-11-23T07:00:00Z", false))
        assertEquals(ResumeTarget.WORKING, resumeTargetFor("working", true, null, false))
        assertEquals(ResumeTarget.FINISH, resumeTargetFor("done", true, null, false))
        assertNull(resumeTargetFor("done", true, null, true))
        assertNull(resumeTargetFor("working", false, null, false))
        assertNull(resumeTargetFor("cancelled", true, null, false))
    }

    @Test
    fun 経過時間の表示() {
        assertEquals("5:07", formatElapsed(307_000))
        assertEquals("1:02:03", formatElapsed(3_723_000))
    }

    @Test
    fun 利用者IDはUと16進数32文字() {
        val id = newUserId(Random(1))
        assertTrue(Regex("^U[0-9a-f]{32}$").matches(id))
    }

    @Test
    fun APIの返事が失敗ならerrorの日本語で知らせる() {
        val error = assertThrows(ApiException::class.java) {
            ApiClient.parseEnvelope("""{"success":false,"error":"雪かきがまだ終わっていません。"}""", 409)
        }
        assertEquals("雪かきがまだ終わっていません。", error.message)
        assertTrue(ApiClient.parseEnvelope("""{"success":true,"data":null}""", 200).optBoolean("success"))
    }
}
