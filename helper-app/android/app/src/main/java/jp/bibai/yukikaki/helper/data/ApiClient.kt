package jp.bibai.yukikaki.helper.data

import jp.bibai.yukikaki.helper.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONException
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/** サーバーが { success: false, error } を返した・つながらなかったときのエラー。message は画面にそのまま出せる日本語。 */
class ApiException(message: String) : Exception(message)

/**
 * サーバーの API の呼び出しを 1 か所にまとめたもの。サーバーの URL は BuildConfig.API_BASE。
 * 返事はすべて { "success": true, "data": ... } か { "success": false, "error": "日本語" }。
 */
class ApiClient(val baseUrl: String = BuildConfig.API_BASE.trimEnd('/')) {

    private fun enc(value: String): String = URLEncoder.encode(value, "UTF-8")

    // --- 一覧・詳細 ---

    suspend fun listOpen(): List<PublicRequest> =
        call("GET", "/api/help-requests") { Parse.list(it.getJSONArray("data"), Parse::publicRequest) }

    suspend fun active(userId: String): MemberRequest? =
        call("GET", "/api/help-requests/active/${enc(userId)}") { json -> json.optJSONObject("data")?.let(Parse::memberRequest) }

    suspend fun detail(id: String, userId: String): MemberRequest =
        call("GET", "/api/help-requests/${enc(id)}?userId=${enc(userId)}") { Parse.memberRequest(it.getJSONObject("data")) }

    suspend fun arrivalCode(id: String, userId: String): String =
        call("GET", "/api/help-requests/${enc(id)}/arrival-code?userId=${enc(userId)}") { it.getJSONObject("data").getString("code") }

    /** 自分が入ったチームと、消費カロリーの合計(チームの記録)。 */
    suspend fun myTeams(userId: String): MyTeams =
        call("GET", "/api/teams/mine/${enc(userId)}") { Parse.myTeams(it.getJSONObject("data")) }

    /** 美唄の雪山マップ(終わった雪かきごとの、一人ひとりの消費カロリー)。 */
    suspend fun snowPiles(): List<SnowPile> =
        call("GET", "/api/snow-map") { Parse.snowPiles(it.getJSONObject("data")) }

    /** 本人確認が済んでいるか(GET /api/identity/{userId} の verified)。 */
    suspend fun isIdentityVerified(userId: String): Boolean =
        call("GET", "/api/identity/${enc(userId)}") { it.getJSONObject("data").optBoolean("verified") }

    // --- 操作(返事は自分から見た依頼) ---

    suspend fun join(id: String, userId: String, displayName: String): MemberRequest =
        action(id, "join", JSONObject().put("userId", userId).put("displayName", displayName))

    suspend fun leave(id: String, userId: String): MemberRequest = action(id, "leave", userBody(userId))

    suspend fun arrive(id: String, userId: String): MemberRequest = action(id, "arrive", userBody(userId))

    suspend fun start(id: String, userId: String): MemberRequest = action(id, "start", userBody(userId))

    suspend fun finish(id: String, userId: String, areaM2: Int): MemberRequest =
        action(id, "finish", userBody(userId).put("areaM2", areaM2))

    /** すくった回数と消費カロリー(整数・0〜5,000)を送る。 */
    suspend fun scoops(id: String, userId: String, count: Int, calories: Int): MemberRequest =
        action(id, "scoops", userBody(userId).put("count", count).put("calories", calories))

    suspend fun location(id: String, userId: String, lat: Double, lng: Double, accuracy: Double?): MemberRequest {
        val body = userBody(userId).put("lat", lat).put("lng", lng)
        if (accuracy != null && accuracy.isFinite()) body.put("accuracy", accuracy)
        return action(id, "location", body)
    }

    private fun userBody(userId: String) = JSONObject().put("userId", userId)

    private suspend fun action(id: String, name: String, body: JSONObject): MemberRequest =
        call("POST", "/api/help-requests/${enc(id)}/$name", body) { Parse.memberRequest(it.getJSONObject("data")) }

    /** 1 回呼んで、返事を transform で読む。通信も JSON を読むのも裏の処理(メインスレッドの外)で行う。失敗なら ApiException。 */
    private suspend fun <T> call(method: String, path: String, body: JSONObject? = null, transform: (JSONObject) -> T): T =
        withContext(Dispatchers.IO) { transform(callBlocking(method, path, body)) }

    /** 1 回呼ぶ(呼んだスレッドで待つ)。成功なら返事全体の JSON、失敗なら ApiException。 */
    private fun callBlocking(method: String, path: String, body: JSONObject?): JSONObject =
        run {
            val connection = (URL(baseUrl + path).openConnection() as HttpURLConnection).apply {
                requestMethod = method
                connectTimeout = TIMEOUT_MS
                readTimeout = TIMEOUT_MS
                setRequestProperty("Accept", "application/json")
            }
            try {
                if (body != null) {
                    connection.doOutput = true
                    connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                    connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
                }
                val code = connection.responseCode
                val stream = if (code in 200..299) connection.inputStream else connection.errorStream
                val text = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
                parseEnvelope(text, code)
            } catch (error: IOException) {
                throw ApiException("サーバーにつながりませんでした。電波のよいところでもう一度試してください。")
            } finally {
                connection.disconnect()
            }
        }

    companion object {
        private const val TIMEOUT_MS = 15_000

        /** 返事の文字 → JSON。success が true でなければ error の日本語で ApiException。 */
        fun parseEnvelope(text: String, httpCode: Int): JSONObject {
            val json = try {
                JSONObject(text)
            } catch (error: JSONException) {
                throw ApiException("サーバーの返事を読めませんでした(${httpCode})。")
            }
            if (json.optBoolean("success")) return json
            throw ApiException(json.optString("error").ifEmpty { "うまくいきませんでした(${httpCode})。" })
        }
    }
}
