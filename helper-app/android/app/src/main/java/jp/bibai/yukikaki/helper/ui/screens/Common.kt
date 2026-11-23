package jp.bibai.yukikaki.helper.ui.screens

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import jp.bibai.yukikaki.helper.data.MemberRequest
import jp.bibai.yukikaki.helper.ui.Screen
import java.time.Instant

/** 依頼の状態が変わって、別の画面へ移るべきならその画面。今の画面のままでよければ null。 */
fun movedScreen(request: MemberRequest, userId: String, here: Screen): Screen? {
    val me = request.helperOf(userId)
    val next = when {
        request.status == "cancelled" || me == null -> Screen.HelpList
        request.status == "done" -> Screen.Finish(request.id)
        request.status == "working" -> Screen.Working(request.id)
        me.arrivedAt != null -> Screen.Gather(request.id)
        else -> Screen.Place(request.id)
    }
    val isSameKind = next::class == here::class
    return if (isSameKind) null else next
}

/** ISO の時刻 → ミリ秒。読めなければ null。 */
fun parseIsoMs(text: String?): Long? = text?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() }

/** 位置と通知の許可(Android 13 以上は通知も)。 */
fun trackingPermissions(): Array<String> = buildList {
    add(Manifest.permission.ACCESS_FINE_LOCATION)
    add(Manifest.permission.ACCESS_COARSE_LOCATION)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) add(Manifest.permission.POST_NOTIFICATIONS)
}.toTypedArray()

fun hasAllPermissions(context: Context, permissions: Array<String>): Boolean =
    permissions.all { ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED }

/**
 * 画面に入ったら許可を求め、答えが出たら(許可されなくても)onReady を呼ぶ。
 * 許可がすでにあれば、すぐ onReady。
 */
@Composable
fun RequestPermissionsThen(key: Any, permissions: Array<String>, onReady: (Context) -> Unit) {
    val context = LocalContext.current
    val current = rememberUpdatedState(onReady)
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        current.value(context)
    }
    LaunchedEffect(key) {
        if (hasAllPermissions(context, permissions)) current.value(context) else launcher.launch(permissions)
    }
}

/** 数字を 3 桁ごとに区切る(1,234)。 */
fun format(value: Int): String = "%,d".format(value)
