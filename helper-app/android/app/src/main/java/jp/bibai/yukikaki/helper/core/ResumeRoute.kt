package jp.bibai.yukikaki.helper.core

// アプリを開いたとき、いま参加している雪かきから戻る画面を決める(純粋関数)。public/liff/resume-route.js と同じ。

enum class ResumeTarget { PLACE, GATHER, WORKING, FINISH }

/**
 * @param status 依頼の状態(accepted / working / done など)
 * @param isMember 自分が参加者の一覧にいるか
 * @param myArrivedAt 自分の到着時刻(まだなら null)
 * @param hasSeenFinish この端末でお疲れ様の画面をもう見たか
 * @return 戻る画面。戻らないなら null(一覧へ)
 */
fun resumeTargetFor(status: String, isMember: Boolean, myArrivedAt: String?, hasSeenFinish: Boolean): ResumeTarget? {
    if (!isMember) return null
    return when (status) {
        "accepted" -> if (myArrivedAt != null) ResumeTarget.GATHER else ResumeTarget.PLACE
        "working" -> ResumeTarget.WORKING
        "done" -> if (hasSeenFinish) null else ResumeTarget.FINISH
        else -> null
    }
}

/** 経過時間の表示(例: 5:07、1:02:03)。 */
fun formatElapsed(elapsedMs: Long): String {
    val totalSeconds = (elapsedMs.coerceAtLeast(0) / 1000)
    val hours = totalSeconds / 3600
    val minutes = (totalSeconds % 3600) / 60
    val seconds = totalSeconds % 60
    return if (hours > 0) "%d:%02d:%02d".format(hours, minutes, seconds) else "%d:%02d".format(minutes, seconds)
}

/** 雪の多さ → 表示の言葉と、雪の結晶の数。 */
fun amountLabel(amount: String): Pair<String, Int> = when (amount) {
    "little" -> "すこし" to 1
    "lots" -> "たくさん" to 3
    else -> "ふつう" to 2
}
