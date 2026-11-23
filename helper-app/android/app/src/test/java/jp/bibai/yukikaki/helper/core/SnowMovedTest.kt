package jp.bibai.yukikaki.helper.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test

// tests/snow-moved.test.ts と同じ内容。
class SnowMovedTest {
    private val helpers = listOf(HelperScoops("me", 5), HelperScoops("a", 10), HelperScoops("b", null))
    private fun at(mine: Int, team: Int) = ScoopPoint(mine, team)

    @Test
    fun ほかの人はサーバーの回数自分は端末の回数を使う() = assertEquals(18, teamScoops(helpers, "me", 8))

    @Test
    fun 端末の回数がサーバーより少なければサーバーの回数を使う() = assertEquals(15, teamScoops(helpers, "me", 2))

    @Test
    fun 参加者の一覧に自分がいなくても自分の回数を足す() = assertEquals(7, teamScoops(listOf(HelperScoops("a", 3)), "me", 4))

    @Test
    fun 届いた中でいちばん大きいたとえ() =
        assertEquals(SnowMoved.COMPARISONS[1], comparisonFor(SnowMoved.COMPARISONS[1].kg + 1))

    @Test
    fun いちばん小さいたとえにも届いていなければnull() = assertNull(comparisonFor(SnowMoved.COMPARISONS[0].kg - 1))

    @Test
    fun 回数が増えていなければ何も言わない() = assertNull(announcementFor(at(3, 3), at(3, 3)))

    @Test
    fun 自分が10杯ごとに動かした重さを言う() =
        assertEquals(Announcement(AnnouncementKind.MINE, "10杯!約35キロ動かしました"), announcementFor(at(9, 9), at(10, 10)))

    @Test
    fun 節目でなければ何も言わない() = assertNull(announcementFor(at(10, 10), at(11, 11)))

    @Test
    fun みんなで50杯ごとに言う() = assertEquals(
        Announcement(AnnouncementKind.TEAM, "みんなで50杯、約175キロ動かしました!"),
        announcementFor(at(19, 49), at(20, 50)),
    )

    @Test
    fun たとえの重さを超えたらいちばん優先して言う() = assertEquals(
        Announcement(AnnouncementKind.MILESTONE, "みんなで${SnowMoved.COMPARISONS[0].label}の雪を動かしました!"),
        announcementFor(at(1, 28), at(2, 29)),
    )

    @Test
    fun ゴールや残りの量は言わない() {
        val texts = (0 until 400).map { i -> announcementFor(at(i, i), at(i + 1, i + 1))?.text ?: "" }
        assertFalse(texts.any { it.contains("あと") })
    }
}
