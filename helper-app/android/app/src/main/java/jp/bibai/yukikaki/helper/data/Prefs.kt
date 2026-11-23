package jp.bibai.yukikaki.helper.data

import android.content.Context
import android.content.SharedPreferences
import java.security.SecureRandom

/** 利用者 ID を作る(U + 16 進数 32 文字。LINE の ID と同じ形)。 */
fun newUserId(random: java.util.Random = SecureRandom()): String {
    val bytes = ByteArray(USER_ID_BYTES).also(random::nextBytes)
    return "U" + bytes.joinToString("") { "%02x".format(it) }
}

private const val USER_ID_BYTES = 16

/** 端末に覚えておくもの(SharedPreferences)。利用者 ID・名前・スコップ計の回数(依頼ごと)・音の実況のオン / オフ。 */
class Prefs(context: Context) {
    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences("helper-app", Context.MODE_PRIVATE)

    /** 利用者 ID。はじめて読んだときに作って保存する。 */
    val userId: String
        get() = prefs.getString(KEY_USER_ID, null) ?: newUserId().also {
            prefs.edit().putString(KEY_USER_ID, it).apply()
        }

    var displayName: String?
        get() = prefs.getString(KEY_NAME, null)?.takeIf { it.isNotBlank() }
        set(value) = prefs.edit().putString(KEY_NAME, value?.trim()).apply()

    fun scoopCount(requestId: String): Int = prefs.getInt(KEY_SCOOPS + requestId, 0).coerceAtLeast(0)

    fun saveScoopCount(requestId: String, count: Int) = prefs.edit().putInt(KEY_SCOOPS + requestId, count).apply()

    var isSoundOn: Boolean
        get() = prefs.getBoolean(KEY_SOUND, true)
        set(value) = prefs.edit().putBoolean(KEY_SOUND, value).apply()

    fun hasSeenFinish(requestId: String): Boolean = prefs.getBoolean(KEY_SEEN_FINISH + requestId, false)

    fun markSeenFinish(requestId: String) = prefs.edit().putBoolean(KEY_SEEN_FINISH + requestId, true).apply()

    private companion object {
        const val KEY_USER_ID = "userId"
        const val KEY_NAME = "displayName"
        const val KEY_SCOOPS = "scoops:"
        const val KEY_SOUND = "soundOn"
        const val KEY_SEEN_FINISH = "seenFinish:"
    }
}
