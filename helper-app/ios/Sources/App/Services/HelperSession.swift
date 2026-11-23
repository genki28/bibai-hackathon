// 裏で動かす部分のまとめ役(いちばん大事)。画面を閉じても、ここが動き続ける。
// - 目的地(画面 3)に入ったら位置を読み始め、到着するまで 15 秒ごとに送る(前から 10m 以上動いたか、60 秒たったとき)
// - 雪かき中(画面 5)に入ったらスコップ計と消費カロリーを始め、10 秒ごとと終えるときに回数と kcal を送る。すくうたびに「ザクッ」、節目は読み上げ
// - お疲れ様(画面 7)に進んだら・参加をやめたら、すべて止める
// 位置の裏での利用(UIBackgroundModes の location)でアプリが止まらないので、タイマーも送信も読み上げも続く。
// 到着したあとも位置は読み続ける(送らない)。読むのをやめると、画面を閉じたときにアプリが止まってしまうため。

import Combine
import Foundation
import HelperCore

@MainActor
final class HelperSession: ObservableObject {
    /// 回数を送る間隔(秒)。
    private static let scoopSendIntervalSeconds: TimeInterval = 10

    /// 地図に出す自分の位置(本物かデモ)。
    @Published private(set) var myPoint: GeoPoint?
    /// 位置の共有の様子(画面に出す文)。
    @Published private(set) var locationStatus = ""
    /// 自分のすくった回数(端末で数えた値)。
    @Published private(set) var myScoops = 0
    /// 自分の消費カロリー(kcal。端末で数えた値)。
    @Published private(set) var myKcal = 0.0
    /// みんなのすくった回数。
    @Published private(set) var teamCount = 0
    /// スコップ計(加速度)が使えるか。
    @Published private(set) var isMotionAvailable = true
    @Published private(set) var isSoundOn = UserStore.isSoundCoachOn

    let userId: String
    private let api: ApiClient
    private let tracker = LocationTracker()
    private let motion = MotionScoopMeter()
    private let coach = SoundCoach()

    private var requestId: String?
    private var home = HelpRequest.bibaiCenter
    private var hasArrived = false
    private var isDemo = false
    private var fakePoint: GeoPoint?
    private var latestFix: LocationTracker.Fix?
    private var lastSent: SentLocation?
    private var isSendingLocation = false
    private var locationTimer: Timer?

    private var isScooping = false
    private var scoopTimer: Timer?
    private var lastSentScoops: Int?
    private var lastSentCalories: Int?
    private var helpers: [HelperScoops] = []
    private var lastCounts = ScoopCounts(mine: 0, team: 0)

    init(userId: String, api: ApiClient = .shared) {
        self.userId = userId
        self.api = api
        tracker.onFix = { [weak self] fix in self?.onFix(fix) }
        tracker.onFailure = { [weak self] message in self?.setLocationStatus(message) }
    }

    // MARK: - 位置(画面 3 から)

    /// 位置を読み始める(何度呼んでもよい。別の依頼なら切り替える)。
    func beginTrip(_ request: HelpRequest) {
        if requestId != request.id { switchRequest(to: request) }
        home = request.home
        hasArrived = hasArrived || request.hasArrived(userId)
        tracker.start()
        if locationTimer == nil {
            if latestFix == nil && !isDemo { setLocationStatus("位置を読み込んでいます…") }
            locationTimer = Timer.scheduledTimer(withTimeInterval: LocationSharePolicy.sendIntervalSeconds, repeats: true) { _ in
                MainActor.assumeIsolated { self.tickLocation() }
            }
        }
    }

    /// 到着したら、もう位置は送らない(読むのは続ける)。
    func markArrived() {
        hasArrived = true
        setLocationStatus("")
    }

    /// [テスト: 家に近づく] 家から南西へ約 1km の所から、押すたびに 150m ずつ近づいた位置を送る。
    func demoStep() async {
        let from = fakePoint ?? fakeStartPoint(home: home)
        let next = stepToward(from, home, stepM: LocationSharePolicy.fakeStepM)
        fakePoint = next
        // デモの位置を使い始めたら、本物の位置は使わない(地図の「あなた」が行ったり来たりしないように)
        isDemo = true
        myPoint = next
        await sendLocation(next, accuracy: 10)
        locationStatus = "テストの位置を送りました(家まで約 \(Int(distanceM(next, home).rounded())) m)"
    }

    /// 地図の「あなた」を動かす最小の距離(m)。位置は 1 秒に何度も届くので、少しの揺れでは画面を描き直さない。
    private static let mapMoveThresholdM = 5.0

    private func onFix(_ fix: LocationTracker.Fix) {
        latestFix = fix
        guard !isDemo else { return }
        // @Published は同じ値を入れても画面を描き直すので、変わったときだけ入れる
        if myPoint.map({ distanceM($0, fix.point) >= Self.mapMoveThresholdM }) ?? true { myPoint = fix.point }
        setLocationStatus(hasArrived ? "" : "位置を共有しています(到着するまで)")
        if lastSent == nil { Task { await self.sendLocation(fix.point, accuracy: fix.accuracy) } }
    }

    private func setLocationStatus(_ text: String) {
        if locationStatus != text { locationStatus = text }
    }

    private func tickLocation() {
        guard !isDemo, !hasArrived, let fix = latestFix else { return }
        if shouldSendLocation(fix.point, lastSent: lastSent, nowMs: Date().timeIntervalSince1970 * 1000) {
            Task { await self.sendLocation(fix.point, accuracy: fix.accuracy) }
        }
    }

    private func sendLocation(_ point: GeoPoint, accuracy: Double?) async {
        guard let requestId, !hasArrived, !isSendingLocation else { return }
        isSendingLocation = true
        defer { isSendingLocation = false }
        do {
            _ = try await api.sendLocation(id: requestId, userId: userId, lat: point.lat, lng: point.lng, accuracy: accuracy)
            lastSent = SentLocation(point: point, timeMs: Date().timeIntervalSince1970 * 1000)
        } catch {
            // 送れなくても参加は続けられる。次の間隔でまた送る
            NSLog("位置を送れませんでした: %@", error.localizedDescription)
        }
    }

    // MARK: - スコップ計(画面 5 から)

    /// スコップ計を始める(何度呼んでもよい)。回数は端末に覚えた続きから数える。
    func beginScooping(_ request: HelpRequest) {
        beginTrip(request)
        updateHelpers(request)
        guard !isScooping else { return }
        isScooping = true
        AudioSessionSetup.activate()
        let saved = UserStore.scoopCount(requestId: request.id)
        let server = request.helper(userId)?.scoops ?? 0
        myScoops = max(saved, server)
        teamCount = teamScoops(helpers, myUserId: userId, myCount: myScoops)
        lastCounts = ScoopCounts(mine: myScoops, team: teamCount)
        isMotionAvailable = motion.isAvailable
        myKcal = UserStore.calories(requestId: request.id)
        motion.start(
            from: myScoops,
            kcal: myKcal,
            onCount: { [weak self] count in self?.handleCount(count) },
            onCalories: { [weak self] kcal in self?.handleCalories(kcal) }
        )
        scoopTimer = Timer.scheduledTimer(withTimeInterval: Self.scoopSendIntervalSeconds, repeats: true) { _ in
            _ = MainActor.assumeIsolated { Task { await self.flushScoops() } }
        }
        coach.say("スコップ計、スタート!")
    }

    /// [テスト: 揺れをまねる] 1 回すくったことにする(消費カロリーにも 1 秒ぶんの揺れを入れる)。
    func simulateScoop() {
        let next = myScoops + 1
        motion.sync(count: next)
        motion.simulateShake()
        handleCount(next)
    }

    /// サーバーから読んだ参加者の回数を入れる(ほかの人の回数が増えたら、実況にも使う)。
    func updateHelpers(_ request: HelpRequest) {
        guard request.id == requestId else { return }
        helpers = request.allHelpers.map { HelperScoops(userId: $0.userId, scoops: $0.scoops) }
        guard isScooping else { return }
        announce(mine: myScoops, isScoop: false)
    }

    /// いまの回数と消費カロリーをサーバーに送る(前に送った値から変わっていれば)。
    func flushScoops() async {
        let calories = caloriesToSend(myKcal)
        guard let requestId, isScooping, lastSentScoops != myScoops || lastSentCalories != calories else { return }
        let count = myScoops
        do {
            let latest = try await api.sendScoops(id: requestId, userId: userId, count: count, calories: calories)
            lastSentScoops = count
            lastSentCalories = calories
            updateHelpers(latest)
        } catch {
            // 送れなくても端末の回数は残る。次の間隔でまた送る
            NSLog("回数を送れませんでした: %@", error.localizedDescription)
        }
    }

    func setSoundOn(_ isOn: Bool) {
        coach.setOn(isOn)
        isSoundOn = isOn
        if isOn { coach.say("音の実況、オン") }
    }

    private func handleCount(_ count: Int) {
        guard isScooping, count > myScoops, let requestId else { return }
        UserStore.saveScoopCount(count, requestId: requestId)
        coach.scoop()
        announce(mine: count, isScoop: true)
    }

    private func handleCalories(_ kcal: Double) {
        guard isScooping, kcal > myKcal, let requestId else { return }
        myKcal = kcal
        UserStore.saveCalories(kcal, requestId: requestId)
    }

    private func announce(mine: Int, isScoop: Bool) {
        if myScoops != mine { myScoops = mine }
        let next = ScoopCounts(mine: mine, team: teamScoops(helpers, myUserId: userId, myCount: mine))
        if teamCount != next.team { teamCount = next.team }
        defer { lastCounts = next }
        guard let announcement = announcementFor(prev: lastCounts, next: next) else { return }
        if announcement.kind == .milestone { coach.fanfare() }
        coach.say(announcement.text)
    }

    // MARK: - 止める

    /// すべて止める(お疲れ様へ進んだ・参加をやめた)。
    func endAll() {
        tracker.stop()
        motion.stop()
        locationTimer?.invalidate()
        scoopTimer?.invalidate()
        locationTimer = nil
        scoopTimer = nil
        isScooping = false
        requestId = nil
        setLocationStatus("")
    }

    private func switchRequest(to request: HelpRequest) {
        endAll()
        requestId = request.id
        hasArrived = false
        isDemo = false
        fakePoint = nil
        latestFix = nil
        lastSent = nil
        myPoint = nil
        lastSentScoops = nil
        lastSentCalories = nil
        helpers = []
        myKcal = UserStore.calories(requestId: request.id)
        myScoops = UserStore.scoopCount(requestId: request.id)
        teamCount = myScoops
    }
}
