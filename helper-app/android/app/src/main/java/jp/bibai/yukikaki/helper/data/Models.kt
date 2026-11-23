package jp.bibai.yukikaki.helper.data

import jp.bibai.yukikaki.helper.core.HelperScoops
import jp.bibai.yukikaki.helper.core.LatLng
import org.json.JSONArray
import org.json.JSONObject

// サーバーの返事(JSON)の形。src/help-requests/views.ts・snow-map.ts に合わせる。
// 読むのは画面で使う項目だけ。

/** 美唄市の中心あたり(依頼に位置がないとき)。 */
val BIBAI_CENTER = LatLng(43.33, 141.853)

/** 一覧の 1 件(参加していない人に見せる形)。 */
data class PublicRequest(
    val id: String,
    val status: String,
    val amount: String,
    val area: String,
    val helperCount: Int,
    val capacity: Int,
)

data class Helper(
    val userId: String,
    val displayName: String,
    val arrivedAt: String?,
    val scoops: Int?,
)

/** 参加した人に見せる形(GET /api/help-requests/{id}?userId= と POST の返事)。 */
data class MemberRequest(
    val id: String,
    val status: String,
    val amount: String,
    val area: String,
    val name: String?,
    val address: String?,
    val home: LatLng,
    val depth: String?,
    val tools: String?,
    val helpers: List<Helper>,
    val capacity: Int,
    val leaderUserId: String?,
    val startedAt: String?,
    /** elder / helper / guest(guest は参加していない)。 */
    val viewer: String,
) {
    fun helperOf(userId: String): Helper? = helpers.firstOrNull { it.userId == userId }
    fun isMember(userId: String): Boolean = helperOf(userId) != null
    val arrivedCount: Int get() = helpers.count { it.arrivedAt != null }
    val leaderName: String get() = helpers.firstOrNull { it.userId == leaderUserId }?.displayName ?: "リーダー"
    /** 範囲を記録して終われるか(リーダー。リーダーがいない古い依頼はだれでも)。 */
    fun canFinish(userId: String): Boolean = leaderUserId == null || leaderUserId == userId
    fun scoops(): List<HelperScoops> = helpers.map { HelperScoops(it.userId, it.scoops) }
}

/** チームの記録の 1 件(終わった雪かき 1 回)。 */
data class TeamRecord(
    val id: String,
    val finishedAt: String?,
    val area: String,
    val members: List<String>,
    val teamCalories: Int,
    val myCalories: Int,
)

/** 雪山マップの 1 つ(終わった雪かき 1 回)の、一人ひとりの消費カロリー。 */
data class PileMember(val displayName: String, val calories: Int)

data class SnowPile(val id: String, val members: List<PileMember>)

/** GET /api/teams/mine/{userId} の返事。 */
data class MyTeams(
    val totalCalories: Int,
    val teamCount: Int,
    val partners: Int,
    val teams: List<TeamRecord>,
)

private fun JSONObject.optStringOrNull(key: String): String? =
    if (isNull(key) || !has(key)) null else optString(key).ifEmpty { null }

private fun JSONObject.optIntOrNull(key: String): Int? = if (isNull(key) || !has(key)) null else optInt(key)

private fun <T> JSONArray?.mapObjects(transform: (JSONObject) -> T): List<T> =
    if (this == null) emptyList() else (0 until length()).map { transform(getJSONObject(it)) }

object Parse {
    fun publicRequest(o: JSONObject) = PublicRequest(
        id = o.getString("id"),
        status = o.optString("status"),
        amount = o.optString("amount", "normal"),
        area = o.optString("area", "美唄市内"),
        helperCount = o.optInt("helperCount"),
        capacity = o.optInt("capacity", 5),
    )

    private fun helper(o: JSONObject) = Helper(
        userId = o.getString("userId"),
        displayName = o.optString("displayName", "名無し"),
        arrivedAt = o.optStringOrNull("arrivedAt"),
        scoops = o.optIntOrNull("scoops"),
    )

    fun memberRequest(o: JSONObject): MemberRequest {
        val lat = if (o.isNull("lat") || !o.has("lat")) o.optDouble("approxLat", BIBAI_CENTER.lat) else o.getDouble("lat")
        val lng = if (o.isNull("lng") || !o.has("lng")) o.optDouble("approxLng", BIBAI_CENTER.lng) else o.getDouble("lng")
        return MemberRequest(
            id = o.getString("id"),
            status = o.optString("status"),
            amount = o.optString("amount", "normal"),
            area = o.optString("area", "美唄市内"),
            name = o.optStringOrNull("name"),
            address = o.optStringOrNull("address"),
            home = LatLng(lat, lng),
            depth = o.optStringOrNull("depth"),
            tools = o.optStringOrNull("tools"),
            helpers = o.optJSONArray("helpers").mapObjects(::helper),
            capacity = o.optInt("capacity", 5),
            leaderUserId = o.optStringOrNull("leaderUserId"),
            startedAt = o.optStringOrNull("startedAt"),
            viewer = o.optString("viewer", "guest"),
        )
    }

    private fun teamRecord(o: JSONObject): TeamRecord {
        val members = o.optJSONArray("members")
        return TeamRecord(
            id = o.getString("id"),
            finishedAt = o.optStringOrNull("finishedAt"),
            area = o.optString("area", "美唄市内"),
            members = if (members == null) emptyList() else (0 until members.length()).map { members.optString(it) },
            teamCalories = o.optInt("teamCalories"),
            myCalories = o.optInt("myCalories"),
        )
    }

    fun myTeams(o: JSONObject) = MyTeams(
        totalCalories = o.optInt("totalCalories"),
        teamCount = o.optInt("teamCount"),
        partners = o.optInt("partners"),
        teams = o.optJSONArray("teams").mapObjects(::teamRecord),
    )

    /** GET /api/snow-map の data → 雪山の一覧(画面で使う id と一人ひとりの kcal だけ)。 */
    fun snowPiles(o: JSONObject): List<SnowPile> = o.optJSONArray("piles").mapObjects { pile ->
        SnowPile(
            id = pile.getString("id"),
            members = pile.optJSONArray("members").mapObjects { PileMember(it.optString("displayName", "名無し"), it.optInt("calories")) },
        )
    }

    fun <T> list(array: JSONArray?, transform: (JSONObject) -> T): List<T> = array.mapObjects(transform)
}
