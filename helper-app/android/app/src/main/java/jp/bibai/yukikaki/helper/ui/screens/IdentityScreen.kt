package jp.bibai.yukikaki.helper.ui.screens

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import jp.bibai.yukikaki.helper.ui.AppDeps
import jp.bibai.yukikaki.helper.ui.BrandLine
import jp.bibai.yukikaki.helper.ui.ErrorText
import jp.bibai.yukikaki.helper.ui.Palette
import jp.bibai.yukikaki.helper.ui.PollEffect
import jp.bibai.yukikaki.helper.ui.Screen
import jp.bibai.yukikaki.helper.ui.TestButton
import kotlinx.coroutines.launch
import java.net.URLEncoder

private const val IDENTITY_POLL_MS = 2000L

/** 本人確認の画面の URL(Web と同じ画面。顔の照合はその画面がスマホの中で行う)。 */
fun identityUrl(baseUrl: String, userId: String, displayName: String): String =
    "$baseUrl/liff/identity.html?appUserId=${URLEncoder.encode(userId, "UTF-8")}" +
        "&appName=${URLEncoder.encode(displayName, "UTF-8").replace("+", "%20")}"

private fun hasCamera(context: Context) =
    ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED

/**
 * 本人確認(SPEC の「第 2 版の変更」5)。参加したあと、確認がまだなら開く。
 * アプリの中のブラウザ(WebView)で identity.html を開き、2 秒ごとに GET /api/identity/{userId} を読んで、
 * verified: true になったら目的地(3)へ進む。[テスト: 本人確認をスキップ] はその Web の画面の下にある。
 */
@Composable
fun IdentityScreen(deps: AppDeps, id: String, go: (Screen) -> Unit) {
    val context = LocalContext.current
    var error by remember { mutableStateOf("") }
    var isBusy by remember { mutableStateOf(false) }
    var isCameraAsked by remember { mutableStateOf(false) }
    // Web の画面がカメラを求めたとき、Android の許可を取ってから答える
    var pendingRequest by remember { mutableStateOf<PermissionRequest?>(null) }
    val scope = rememberCoroutineScope()
    val url = remember { identityUrl(deps.api.baseUrl, deps.userId, deps.prefs.displayName ?: "") }

    val cameraLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { isGranted ->
        isCameraAsked = true
        pendingRequest?.let { answerCamera(it, isGranted) }
        pendingRequest = null
    }
    LaunchedEffect(Unit) {
        if (!hasCamera(context)) cameraLauncher.launch(Manifest.permission.CAMERA) else isCameraAsked = true
    }

    LaunchedEffect(Unit) {
        if (runCatching { deps.api.isIdentityVerified(deps.userId) }.getOrDefault(false)) go(Screen.Place(id))
    }
    PollEffect(id, IDENTITY_POLL_MS) {
        val isVerified = deps.api.isIdentityVerified(deps.userId)
        if (isVerified) go(Screen.Place(id))
        isVerified
    }

    val chromeClient = remember {
        object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                val wantsCamera = PermissionRequest.RESOURCE_VIDEO_CAPTURE in request.resources
                when {
                    !wantsCamera -> request.deny()
                    hasCamera(context) -> answerCamera(request, isGranted = true)
                    else -> {
                        pendingRequest = request
                        cameraLauncher.launch(Manifest.permission.CAMERA)
                    }
                }
            }
        }
    }

    Column(Modifier.fillMaxSize().background(Palette.White)) {
        BrandLine()
        ErrorText(error)
        if (isCameraAsked) {
            IdentityWebView(url, chromeClient, Modifier.weight(1f).fillMaxWidth())
        } else {
            Column(Modifier.weight(1f)) {}
        }
        Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 4.dp)) {
            TestButton("参加をやめる", isEnabled = !isBusy, onClick = {
                isBusy = true
                scope.launch {
                    try {
                        deps.api.leave(id, deps.userId)
                        go(Screen.HelpList)
                    } catch (e: Exception) {
                        error = "参加をやめられませんでした: ${e.message}"
                    } finally {
                        isBusy = false
                    }
                }
            })
        }
    }
}

/** カメラだけを許す(ほかのもの = マイクなどは許さない)。 */
private fun answerCamera(request: PermissionRequest, isGranted: Boolean) {
    if (isGranted) request.grant(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE)) else request.deny()
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
private fun IdentityWebView(url: String, chromeClient: WebChromeClient, modifier: Modifier) {
    var webView by remember { mutableStateOf<WebView?>(null) }
    DisposableEffect(Unit) { onDispose { webView?.destroy() } }
    AndroidView(
        modifier = modifier,
        factory = { ctx ->
            WebView(ctx).apply {
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                // 自撮りの映像を、押さなくても再生する(カメラの映像を画面に出すため)
                settings.mediaPlaybackRequiresUserGesture = false
                webViewClient = WebViewClient()
                webChromeClient = chromeClient
                loadUrl(url)
                webView = this
            }
        },
    )
}
