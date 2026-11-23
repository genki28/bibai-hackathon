package jp.bibai.yukikaki.helper.service

import android.Manifest
import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.IBinder
import android.os.Handler
import android.os.HandlerThread
import android.os.PowerManager
import android.speech.tts.TextToSpeech
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import jp.bibai.yukikaki.helper.R
import jp.bibai.yukikaki.helper.core.AnnouncementKind
import jp.bibai.yukikaki.helper.core.CalorieState
import jp.bibai.yukikaki.helper.core.caloriesToSend
import jp.bibai.yukikaki.helper.core.stepCalories
import jp.bibai.yukikaki.helper.core.Geo
import jp.bibai.yukikaki.helper.core.HelperScoops
import jp.bibai.yukikaki.helper.core.LatLng
import jp.bibai.yukikaki.helper.core.ScoopPoint
import jp.bibai.yukikaki.helper.core.ScoopSample
import jp.bibai.yukikaki.helper.core.ScoopState
import jp.bibai.yukikaki.helper.core.SentPoint
import jp.bibai.yukikaki.helper.core.announcementFor
import jp.bibai.yukikaki.helper.core.scoopKg
import jp.bibai.yukikaki.helper.core.stepScoop
import jp.bibai.yukikaki.helper.core.teamScoops
import jp.bibai.yukikaki.helper.data.ApiClient
import jp.bibai.yukikaki.helper.data.ApiException
import jp.bibai.yukikaki.helper.data.Prefs
import jp.bibai.yukikaki.helper.sound.Effects
import jp.bibai.yukikaki.helper.ui.MainActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.android.asCoroutineDispatcher
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.util.Locale

/**
 * 画面を閉じても動き続ける仕組み(フォアグラウンドサービス)。SPEC の「裏で動かす」。
 * - 位置: LocationManager で読み、15 秒ごと(10m 以上動いたか 60 秒たったとき)にサーバーへ送る
 * - スコップ計: 加速度(TYPE_LINEAR_ACCELERATION。なければ TYPE_ACCELEROMETER と重力の推定)で数え、10 秒ごとに送る
 * - 消費カロリー: 同じ加速度から数え(core/Calories.kt)、回数と一緒に送る
 * - 通知「雪かき中: 〇杯 / 約〇kg」を出し続け、すくうたびに「ザクッ」、節目は TextToSpeech で読み上げる
 * - これらはすべて裏のスレッド(workerThread)で動かす。画面(メインスレッド)ではセンサーの計算をしない
 */
class HelperService : Service(), SensorEventListener {

    /**
     * 裏の処理用の 1 本のスレッド。センサー(1 秒に 50 回ほど)・位置・送信・音はすべてここで動かし、
     * 画面(メインスレッド)を重くしない。1 本だけなので、変数を同時に書き換えることはない。
     */
    private val workerThread = HandlerThread("helper-worker").apply { start() }
    private val worker = Handler(workerThread.looper)
    private val scope = CoroutineScope(SupervisorJob() + worker.asCoroutineDispatcher())
    private val api = ApiClient()
    private lateinit var prefs: Prefs

    private var requestId: String? = null
    private var userId: String? = null

    // 位置
    private var home: LatLng? = null
    private var latestLocation: Location? = null
    private var lastSent: SentPoint? = null
    private var demoPoint: LatLng? = null
    private var isLocationOn = false
    private var locationJob: Job? = null

    // スコップ計
    private var scoopState = ScoopState.EMPTY
    private var sentCount = 0
    private var calorieState = CalorieState.EMPTY
    private var sentCalories = 0
    private var helpers: List<HelperScoops> = emptyList()
    private var lastPoint = ScoopPoint(0, 0)
    private var isScoopOn = false
    private var scoopJob: Job? = null
    private var isUsingGravityFallback = false
    private var wakeLock: PowerManager.WakeLock? = null
    private var lastNotifiedAt = 0L

    private var tts: TextToSpeech? = null
    @Volatile private var isTtsReady = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        prefs = Prefs(this)
        createChannel()
        tts = TextToSpeech(this) { status ->
            isTtsReady = status == TextToSpeech.SUCCESS
            if (isTtsReady) tts?.language = Locale.JAPAN
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // フォアグラウンドにするのは、すぐ(ここで)行う。中身の処理は裏のスレッドへ
        if (intent?.action == ACTION_LOCATION || intent?.action == ACTION_SCOOPS) promote()
        worker.post { handle(intent) }
        return START_NOT_STICKY
    }

    private fun handle(intent: Intent?) {
        when (intent?.action) {
            ACTION_LOCATION -> startLocation(intent)
            ACTION_SCOOPS -> startScoops(intent)
            ACTION_DEMO_STEP -> demoStep()
            ACTION_FAKE_SCOOP -> addScoops(scoopState.copy(count = scoopState.count + 1))
            ACTION_SOUND -> setSound(intent.getBooleanExtra(EXTRA_SOUND_ON, true))
            ACTION_FLUSH -> scope.launch { sendScoops() }
            ACTION_STOP_LOCATION -> {
                stopLocation()
                stopIfIdle()
            }
            ACTION_STOP -> stopEverything()
            // 仕組みに止められて、また起こされたとき(intent が null)は、覚えていないので止める
            else -> if (!isLocationOn && !isScoopOn) stopSelf()
        }
    }

    override fun onDestroy() {
        worker.post {
            stopLocation()
            stopScoopsQuietly()
            tts?.shutdown()
            HelperTracker.update { TrackerState() }
        }
        scope.cancel()
        // たまっている処理(上の後片付け)を終えてから、スレッドを止める
        workerThread.quitSafely()
        super.onDestroy()
    }

    // ---------- フォアグラウンド(通知) ----------

    private fun hasPermission(permission: String) =
        ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED

    private fun hasLocationPermission() =
        hasPermission(Manifest.permission.ACCESS_FINE_LOCATION) || hasPermission(Manifest.permission.ACCESS_COARSE_LOCATION)

    /**
     * 通知を出して、フォアグラウンドサービスにする(画面を閉じても止められにくくなる)。
     * 位置の許可があれば「位置」の種類。なければ Android 14 以上は「健康(センサー)」の種類でスコップ計だけ続ける。
     */
    private fun promote() {
        val type = when {
            hasLocationPermission() -> ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE -> ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH
            else -> 0
        }
        val warning = try {
            ServiceCompat.startForeground(this, NOTIFICATION_ID, buildNotification(), type)
            ""
        } catch (error: Exception) {
            // 許可が足りないなどで通知を出せない。画面を開いている間は動くが、閉じると止まることがある
            Log.e(TAG, "フォアグラウンドサービスにできませんでした", error)
            "画面を閉じると止まることがあります(位置の許可を確かめてください)"
        }
        HelperTracker.update { it.copy(backgroundWarning = warning) }
    }

    private fun createChannel() {
        val channel = NotificationChannel(CHANNEL_ID, "雪かきの記録", NotificationManager.IMPORTANCE_LOW).apply {
            description = "画面を閉じている間も、位置とスコップ計を記録していることを知らせます"
            setShowBadge(false)
        }
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    private fun notificationText(): String = when {
        isScoopOn -> "雪かき中: ${scoopState.count}杯 / 約${scoopKg(scoopState.count)}kg"
        isLocationOn -> "目的地へ向かっています(位置を共有中)"
        else -> "準備中"
    }

    private fun buildNotification(): Notification {
        val open = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_snowflake)
            .setContentTitle("雪かきお助け")
            .setContentText(notificationText())
            .setContentIntent(open)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build()
    }

    /** 通知の文字を今の回数に合わせる(何度も書き換えすぎないよう、1 秒に 1 回まで)。 */
    private fun refreshNotification(isForced: Boolean = false) {
        val now = System.currentTimeMillis()
        if (!isForced && now - lastNotifiedAt < NOTIFY_MIN_INTERVAL_MS) return
        lastNotifiedAt = now
        runCatching { getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, buildNotification()) }
    }

    // ---------- 位置 ----------

    private val locationListener = LocationListener { location ->
        if (demoPoint != null) return@LocationListener
        latestLocation = location
        val point = LatLng(location.latitude, location.longitude)
        HelperTracker.update { it.copy(myLocation = point, locationStatus = "位置を共有しています(到着するまで)") }
        if (lastSent == null) scope.launch { sendLocation(point, location.accuracyOrNull()) }
    }

    private fun Location.accuracyOrNull(): Double? = if (hasAccuracy()) accuracy.toDouble() else null

    @SuppressLint("MissingPermission")
    private fun startLocation(intent: Intent) {
        val id = intent.getStringExtra(EXTRA_REQUEST_ID) ?: return
        val user = intent.getStringExtra(EXTRA_USER_ID) ?: return
        val newHome = LatLng(intent.getDoubleExtra(EXTRA_HOME_LAT, 0.0), intent.getDoubleExtra(EXTRA_HOME_LNG, 0.0))
        if (isLocationOn && requestId == id) return
        switchRequest(id, user)
        home = newHome
        isLocationOn = true
        HelperTracker.update { it.copy(requestId = id, isLocationOn = true, locationStatus = "位置を読み込んでいます…") }
        refreshNotification(isForced = true)
        if (!hasLocationPermission()) {
            HelperTracker.update { it.copy(locationStatus = "位置の許可がないため、位置を送れません") }
        } else {
            val manager = getSystemService(LocationManager::class.java)
            listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)
                .filter { runCatching { manager.isProviderEnabled(it) }.getOrDefault(false) }
                .forEach { provider ->
                    runCatching {
                        manager.requestLocationUpdates(provider, LOCATION_UPDATE_MS, 0f, locationListener, workerThread.looper)
                    }.onFailure { Log.e(TAG, "位置を読み始められませんでした($provider)", it) }
                }
        }
        locationJob?.cancel()
        locationJob = scope.launch {
            while (isActive) {
                delay(Geo.SEND_INTERVAL_MS)
                val location = latestLocation
                if (demoPoint == null && location != null) {
                    val point = LatLng(location.latitude, location.longitude)
                    if (Geo.shouldSend(point, System.currentTimeMillis(), lastSent)) sendLocation(point, location.accuracyOrNull())
                }
            }
        }
    }

    /** デモ: 家へ 150m 近づいた位置を送る。押したら本物の位置は使わない。 */
    private fun demoStep() {
        val target = home ?: return
        if (!isLocationOn) return
        val next = Geo.stepToward(demoPoint ?: Geo.demoStart(target), target, Geo.DEMO_STEP_M)
        demoPoint = next
        stopLocationUpdates()
        val meters = Geo.distanceM(next, target).toInt()
        HelperTracker.update {
            it.copy(myLocation = next, isDemo = true, locationStatus = "デモの位置を送りました(家まで約 $meters m)")
        }
        scope.launch { sendLocation(next, DEMO_ACCURACY_M) }
    }

    private suspend fun sendLocation(point: LatLng, accuracy: Double?) {
        val id = requestId ?: return
        val user = userId ?: return
        try {
            api.location(id, user, point.lat, point.lng, accuracy)
            lastSent = SentPoint(point, System.currentTimeMillis())
        } catch (error: ApiException) {
            // 送れなくても参加は続けられる。次の間隔でまた送る
            Log.w(TAG, "位置を送れませんでした: ${error.message}")
        }
    }

    private fun stopLocationUpdates() {
        runCatching { getSystemService(LocationManager::class.java).removeUpdates(locationListener) }
    }

    private fun stopLocation() {
        stopLocationUpdates()
        locationJob?.cancel()
        locationJob = null
        isLocationOn = false
        latestLocation = null
        lastSent = null
        demoPoint = null
        HelperTracker.update { it.copy(isLocationOn = false, isDemo = false, locationStatus = "") }
    }

    // ---------- スコップ計 ----------

    private fun startScoops(intent: Intent) {
        val id = intent.getStringExtra(EXTRA_REQUEST_ID) ?: return
        val user = intent.getStringExtra(EXTRA_USER_ID) ?: return
        if (isScoopOn && requestId == id) return
        switchRequest(id, user)
        stopLocation()
        scoopState = ScoopState.from(prefs.scoopCount(id))
        sentCount = 0
        calorieState = CalorieState.from(prefs.calories(id))
        sentCalories = 0
        lastPoint = ScoopPoint(scoopState.count, scoopState.count)
        isScoopOn = true
        val sensors = getSystemService(SensorManager::class.java)
        val linear = sensors.getDefaultSensor(Sensor.TYPE_LINEAR_ACCELERATION)
        val sensor = linear ?: sensors.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
        isUsingGravityFallback = linear == null
        val status = if (sensor != null && sensors.registerListener(this, sensor, SensorManager.SENSOR_DELAY_GAME, worker)) {
            "スコップ計: 数えています"
        } else {
            "この端末ではスコップ計が使えません"
        }
        acquireWakeLock()
        HelperTracker.update {
            it.copy(
                requestId = id,
                isScoopOn = true,
                scoopCount = scoopState.count,
                teamCount = scoopState.count,
                scoopStatus = status,
                calories = caloriesToSend(calorieState.kcal),
            )
        }
        refreshNotification(isForced = true)
        scoopJob?.cancel()
        scoopJob = scope.launch {
            sendScoops()
            while (isActive) {
                delay(SCOOP_SEND_INTERVAL_MS)
                sendScoops()
            }
        }
    }

    override fun onSensorChanged(event: SensorEvent) {
        if (!isScoopOn || event.values.size < 3) return
        val sample = ScoopSample(
            t = event.timestamp / NANOS_PER_MS,
            x = event.values[0].toDouble(),
            y = event.values[1].toDouble(),
            z = event.values[2].toDouble(),
            includesGravity = isUsingGravityFallback,
        )
        addCalories(stepCalories(calorieState, sample))
        addScoops(stepScoop(scoopState, sample))
    }

    /** 消費カロリーを進める。整数の値が変わったときだけ画面に知らせる。 */
    private fun addCalories(next: CalorieState) {
        val shown = caloriesToSend(calorieState.kcal)
        calorieState = next
        val now = caloriesToSend(next.kcal)
        if (now != shown) HelperTracker.update { it.copy(calories = now) }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit

    private fun addScoops(next: ScoopState) {
        if (!isScoopOn) return
        val added = next.count - scoopState.count
        scoopState = next
        if (added <= 0) return
        requestId?.let { prefs.saveScoopCount(it, next.count) }
        if (prefs.isSoundOn) Effects.scoop()
        announce()
        refreshNotification()
    }

    /** 回数が変わったら、みんなの回数を出し直して、節目なら読み上げる。 */
    private fun announce() {
        val user = userId ?: return
        val next = ScoopPoint(scoopState.count, teamScoops(helpers, user, scoopState.count))
        val announcement = announcementFor(lastPoint, next)
        lastPoint = next
        HelperTracker.update { it.copy(scoopCount = next.mine, teamCount = next.team) }
        if (announcement == null || !prefs.isSoundOn) return
        if (announcement.kind == AnnouncementKind.MILESTONE) Effects.fanfare()
        say(announcement.text)
    }

    private fun say(text: String) {
        if (!isTtsReady) return
        tts?.setSpeechRate(SPEECH_RATE)
        tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "coach")
    }

    private fun setSound(isOn: Boolean) {
        prefs.isSoundOn = isOn
        if (isOn) say("音の実況、オン") else tts?.stop()
    }

    /** いまの回数と消費カロリーをサーバーに送る。返事の参加者の回数で、みんなの回数も新しくする。 */
    private suspend fun sendScoops() {
        val id = requestId ?: return
        val user = userId ?: return
        val count = scoopState.count
        val calories = caloriesToSend(calorieState.kcal)
        // 開き直しても続きから数えられるよう、端末にも覚える
        prefs.saveCalories(id, calorieState.kcal)
        val hasNews = count > sentCount || calories > sentCalories
        try {
            val request = if (hasNews) api.scoops(id, user, count, calories) else api.detail(id, user)
            if (hasNews) {
                sentCount = count
                sentCalories = calories
            }
            helpers = request.scoops()
            announce()
        } catch (error: ApiException) {
            // 送れなくても端末の回数は残る。次の機会にまた送る
            Log.w(TAG, "スコップ計の回数を送れませんでした: ${error.message}")
        }
    }

    @SuppressLint("WakelockTimeout")
    private fun acquireWakeLock() {
        if (wakeLock?.isHeld == true) return
        // 画面を消しても CPU が眠らないようにする(センサーを読み続けるため)。長くても 3 時間で自動で放す
        wakeLock = getSystemService(PowerManager::class.java)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "yukikaki:scoops")
            .apply { acquire(WAKE_LOCK_MAX_MS) }
    }

    private fun stopScoopsQuietly() {
        runCatching { getSystemService(SensorManager::class.java).unregisterListener(this) }
        scoopJob?.cancel()
        scoopJob = null
        isScoopOn = false
        wakeLock?.takeIf { it.isHeld }?.release()
        wakeLock = null
    }

    // ---------- まとめ ----------

    /** 別の依頼に変わったら、前の依頼の記録は止める。 */
    private fun switchRequest(id: String, user: String) {
        if (requestId != null && requestId != id) {
            stopLocation()
            stopScoopsQuietly()
            helpers = emptyList()
        }
        requestId = id
        userId = user
    }

    private fun stopEverything() {
        val id = requestId
        val user = userId
        val count = scoopState.count
        val calories = caloriesToSend(calorieState.kcal)
        val shouldSend = isScoopOn && (count > sentCount || calories > sentCalories)
        if (isScoopOn && id != null) prefs.saveCalories(id, calorieState.kcal)
        stopLocation()
        stopScoopsQuietly()
        if (shouldSend && id != null && user != null) {
            // 最後の回数を送ってから止める
            scope.launch {
                runCatching { api.scoops(id, user, count, calories) }
                stopSelfCompletely()
            }
        } else {
            stopSelfCompletely()
        }
    }

    private fun stopIfIdle() {
        if (!isLocationOn && !isScoopOn) stopSelfCompletely()
    }

    private fun stopSelfCompletely() {
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        HelperTracker.update { TrackerState() }
        stopSelf()
    }

    companion object {
        private const val TAG = "HelperService"
        private const val CHANNEL_ID = "tracking"
        private const val NOTIFICATION_ID = 1
        private const val NOTIFY_MIN_INTERVAL_MS = 1000L
        private const val LOCATION_UPDATE_MS = 5000L
        private const val SCOOP_SEND_INTERVAL_MS = 10_000L
        private const val DEMO_ACCURACY_M = 10.0
        private const val NANOS_PER_MS = 1_000_000.0
        private const val SPEECH_RATE = 1.1f
        private const val WAKE_LOCK_MAX_MS = 3 * 60 * 60 * 1000L

        const val ACTION_LOCATION = "jp.bibai.yukikaki.helper.LOCATION"
        const val ACTION_SCOOPS = "jp.bibai.yukikaki.helper.SCOOPS"
        const val ACTION_DEMO_STEP = "jp.bibai.yukikaki.helper.DEMO_STEP"
        const val ACTION_FAKE_SCOOP = "jp.bibai.yukikaki.helper.FAKE_SCOOP"
        const val ACTION_SOUND = "jp.bibai.yukikaki.helper.SOUND"
        const val ACTION_FLUSH = "jp.bibai.yukikaki.helper.FLUSH"
        const val ACTION_STOP_LOCATION = "jp.bibai.yukikaki.helper.STOP_LOCATION"
        const val ACTION_STOP = "jp.bibai.yukikaki.helper.STOP"

        const val EXTRA_REQUEST_ID = "requestId"
        const val EXTRA_USER_ID = "userId"
        const val EXTRA_HOME_LAT = "homeLat"
        const val EXTRA_HOME_LNG = "homeLng"
        const val EXTRA_SOUND_ON = "soundOn"
    }
}
