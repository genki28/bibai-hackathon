package jp.bibai.yukikaki.helper.data

import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.net.HttpURLConnection
import java.net.URL

/**
 * 手元のサーバーとつないで、参加 → 到着 → 開始 → スコップの回数を送る、までを確かめる。
 * 環境変数 LOCAL_API(例: http://localhost:3000)があるときだけ動く(ふだんは飛ばす)。
 * 公開中のサーバーには使わないこと(テストのデータができてしまう)。
 */
class LocalServerTest {
    private val base: String? = System.getenv("LOCAL_API")?.trimEnd('/')

    private fun createRequest(base: String, elderId: String): String {
        val connection = URL("$base/api/help-requests").openConnection() as HttpURLConnection
        connection.requestMethod = "POST"
        connection.doOutput = true
        connection.setRequestProperty("Content-Type", "application/json")
        val body = JSONObject().put("userId", elderId).put("amount", "lots").put("lat", 43.33).put("lng", 141.853)
        connection.outputStream.use { it.write(body.toString().toByteArray()) }
        val text = connection.inputStream.bufferedReader().use { it.readText() }
        return JSONObject(text).getJSONObject("data").getString("id")
    }

    @Test
    fun 手元のサーバーにスコップの回数を送れる() = runBlocking {
        val url = base
        assumeTrue("LOCAL_API がないので飛ばします", url != null)
        val api = ApiClient(url!!)
        val id = createRequest(url, newUserId())
        val me = newUserId()

        api.join(id, me, "テストの若者")
        api.location(id, me, 43.324, 141.845, 10.0)
        api.arrive(id, me)
        api.start(id, me)
        api.scoops(id, me, 3, 12)
        val detail = api.detail(id, me)

        assertEquals("working", detail.status)
        assertEquals(3, detail.helperOf(me)?.scoops)
    }
}
