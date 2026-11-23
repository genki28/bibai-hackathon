package jp.bibai.yukikaki.helper.core

import kotlin.math.asin
import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt

// 位置の計算(純粋関数)。public/liff/eta.js と location-share.js と同じ決まり。

object Geo {
    /** 地球の半径(m)。 */
    private const val EARTH_RADIUS_M = 6_371_008.8
    /** 歩く速さ(km/h)。 */
    const val WALKING_SPEED_KMH = 4.8
    private const val METERS_PER_MINUTE = WALKING_SPEED_KMH * 1000 / 60

    /** 位置をサーバーに送る間隔(ミリ秒)。 */
    const val SEND_INTERVAL_MS = 15_000L
    /** 前に送った位置からこれ以上動いていなければ送らない(m)。 */
    const val MIN_MOVE_M = 10.0
    /** 動いていなくても、これだけたったら送り直す(ミリ秒)。 */
    const val RESEND_MS = 60_000L

    /** デモ: 最初の位置(家から南西へ約 1km)と、1 回で近づく距離(m)。 */
    const val DEMO_START_OFFSET_LAT = -0.006
    const val DEMO_START_OFFSET_LNG = -0.008
    const val DEMO_STEP_M = 150.0

    private fun toRadians(degrees: Double) = degrees * Math.PI / 180

    /** 2 点のまっすぐの距離(m)。ハバーサイン公式。 */
    fun distanceM(a: LatLng, b: LatLng): Double {
        val dLat = toRadians(b.lat - a.lat)
        val dLng = toRadians(b.lng - a.lng)
        val h = sin(dLat / 2).let { it * it } +
            cos(toRadians(a.lat)) * cos(toRadians(b.lat)) * sin(dLng / 2).let { it * it }
        return 2 * EARTH_RADIUS_M * asin(min(1.0, sqrt(h)))
    }

    /** 到着までのおおよその分(切り上げ。最低 1 分)。 */
    fun etaMinutes(meters: Double): Int = max(1, ceil(max(0.0, meters) / METERS_PER_MINUTE).toInt())

    /** from から to へ stepM(m)だけ近づいた点。残りが stepM 以下なら to。 */
    fun stepToward(from: LatLng, to: LatLng, stepM: Double): LatLng {
        val remaining = distanceM(from, to)
        if (remaining <= stepM) return LatLng(to.lat, to.lng)
        val ratio = stepM / remaining
        return LatLng(from.lat + (to.lat - from.lat) * ratio, from.lng + (to.lng - from.lng) * ratio)
    }

    /** デモの最初の位置(家から南西へ約 1km)。 */
    fun demoStart(home: LatLng): LatLng = LatLng(home.lat + DEMO_START_OFFSET_LAT, home.lng + DEMO_START_OFFSET_LNG)

    /** 送るべき位置か(まだ送っていない・10m 以上動いた・60 秒たった)。 */
    fun shouldSend(point: LatLng, nowMs: Long, lastSent: SentPoint?): Boolean =
        lastSent == null ||
            distanceM(point, lastSent.point) >= MIN_MOVE_M ||
            nowMs - lastSent.atMs >= RESEND_MS
}

/** 最後にサーバーへ送った位置と時刻。 */
data class SentPoint(val point: LatLng, val atMs: Long)
