package jp.bibai.yukikaki.helper.core

// 雪かき中の「みんなで動かした雪」と「実況のことば」の決まり(純粋関数)。public/liff/snow-moved.js と同じ。
// - 残りやゴールは言わない。動かした量を身近な物のたとえで伝える
// - 節目を超えた瞬間だけ言う。同時に超えたら、たとえ > みんなで 50 杯ごと > 自分の 10 杯ごと

object SnowMoved {
    /** 自分の回数を読み上げる間隔(杯)。 */
    const val MINE_STEP = 10
    /** みんなの回数を読み上げる間隔(杯)。 */
    const val TEAM_STEP = 50

    /** 動かした雪の重さのたとえ(軽い順)。 */
    val COMPARISONS: List<Comparison> = listOf(
        Comparison(100, "お米 10 袋ぶん"),
        Comparison(300, "グランドピアノ 1 台ぶん"),
        Comparison(700, "軽自動車 1 台ぶん"),
        Comparison(1500, "ふつうの車 1 台ぶん"),
    )
}

data class Comparison(val kg: Int, val label: String)

/** 参加者 1 人のすくった回数(サーバーの値。なければ null)。 */
data class HelperScoops(val userId: String, val scoops: Int?)

/** 自分とみんなの回数。 */
data class ScoopPoint(val mine: Int, val team: Int)

enum class AnnouncementKind { MILESTONE, TEAM, MINE }

data class Announcement(val kind: AnnouncementKind, val text: String)

/** みんなのすくった回数。ほかの人はサーバーの回数、自分は端末の回数(サーバーより少なければサーバーの回数)。 */
fun teamScoops(helpers: List<HelperScoops>, myUserId: String, myCount: Int): Int {
    val others = helpers.filter { it.userId != myUserId }.sumOf { it.scoops ?: 0 }
    val myServerCount = helpers.firstOrNull { it.userId == myUserId }?.scoops ?: 0
    return others + maxOf(myCount, myServerCount)
}

/** 動かした重さが届いた中で、いちばん大きいたとえ。どれにも届いていなければ null。 */
fun comparisonFor(kg: Int): Comparison? = SnowMoved.COMPARISONS.lastOrNull { kg >= it.kg }

/** 回数が step の倍数をまたいだら、そのいちばん大きい倍数。またいでいなければ null。 */
private fun crossedStep(before: Int, after: Int, step: Int): Int? {
    val reached = Math.floorDiv(after, step) * step
    return if (after > before && reached > before && reached > 0) reached else null
}

/** 回数が変わったときの実況のことば。言うことがなければ null。 */
fun announcementFor(prev: ScoopPoint, next: ScoopPoint): Announcement? {
    val before = comparisonFor(scoopKg(prev.team))
    val after = comparisonFor(scoopKg(next.team))
    if (after != null && after != before) {
        return Announcement(AnnouncementKind.MILESTONE, "みんなで${after.label}の雪を動かしました!")
    }
    crossedStep(prev.team, next.team, SnowMoved.TEAM_STEP)?.let { team ->
        return Announcement(AnnouncementKind.TEAM, "みんなで${team}杯、約${scoopKg(team)}キロ動かしました!")
    }
    crossedStep(prev.mine, next.mine, SnowMoved.MINE_STEP)?.let { mine ->
        return Announcement(AnnouncementKind.MINE, "${mine}杯!約${scoopKg(mine)}キロ動かしました")
    }
    return null
}
