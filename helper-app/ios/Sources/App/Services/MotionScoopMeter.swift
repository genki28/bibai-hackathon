// スコップ計と消費カロリーの「センサーの部分」(CoreMotion)。数え方は HelperCore の stepScoop と stepCalories。
// - deviceMotion.userAcceleration(重力を除いた値。単位は G)に 9.81 を掛けて m/s² にする。1 秒 50 回
// - 画面を閉じても、位置の裏での利用でアプリが動き続けるので、そのまま読み続ける
// - シミュレータでは加速度が出ない([テスト: 揺れをまねる] で数える)

import CoreMotion
import Foundation
import HelperCore

final class MotionScoopMeter: @unchecked Sendable {
    /// 1 秒に読む回数。
    private static let samplesPerSecond = 50.0
    /// G → m/s²。
    private static let gravityMs2 = 9.81

    private let manager = CMMotionManager()
    private let queue: OperationQueue = {
        let queue = OperationQueue()
        queue.name = "scoop-meter"
        queue.maxConcurrentOperationCount = 1
        return queue
    }()
    /// 数えている状態(queue の中だけで触る)。
    private var state = ScoopState.empty
    private var calories = CalorieState.empty
    /// 最後に画面へ知らせた kcal(0.1 kcal 増えるごとに知らせる)。
    private var reportedKcal = 0.0
    private static let reportStepKcal = 0.1
    private var onCalories: (@MainActor (Double) -> Void)?

    var isAvailable: Bool { manager.isDeviceMotionAvailable }

    /// 読み始める。回数が増えたら onCount(新しい回数)をメインスレッドで呼ぶ。
    /// 消費カロリーが増えたら onCalories(kcal)をメインスレッドで呼ぶ。
    func start(
        from count: Int,
        kcal: Double,
        onCount: @escaping @MainActor (Int) -> Void,
        onCalories: @escaping @MainActor (Double) -> Void
    ) {
        queue.addOperation {
            self.calories = .from(kcal: kcal)
            self.reportedKcal = self.calories.kcal
            self.onCalories = onCalories
        }
        guard manager.isDeviceMotionAvailable, !manager.isDeviceMotionActive else { return }
        queue.addOperation { self.state = .from(count: count) }
        manager.deviceMotionUpdateInterval = 1 / Self.samplesPerSecond
        manager.startDeviceMotionUpdates(to: queue) { [weak self] motion, _ in
            guard let self, let motion else { return }
            let a = motion.userAcceleration
            let sample = ScoopSample(
                t: motion.timestamp * 1000,
                x: a.x * Self.gravityMs2,
                y: a.y * Self.gravityMs2,
                z: a.z * Self.gravityMs2
            )
            let before = self.state.count
            self.state = stepScoop(self.state, sample)
            let after = self.state.count
            if after > before { Task { @MainActor in onCount(after) } }
            self.addCalories(sample)
        }
    }

    /// [テスト: 揺れをまねる] 1 秒ぶんの雪かきの揺れ(1 秒 50 回・8 m/s²)を、消費カロリーに入れる。
    func simulateShake() {
        queue.addOperation { [weak self] in
            guard let self else { return }
            let startMs = max(self.calories.lastT ?? 0, ProcessInfo.processInfo.systemUptime * 1000)
            let stepMs = 1000 / Self.samplesPerSecond
            for i in 0...Int(Self.samplesPerSecond) {
                self.addCalories(ScoopSample(t: startMs + Double(i) * stepMs, x: Self.simulatedShakeMs2, y: 0, z: 0))
            }
        }
    }

    /// まねる揺れの大きさ(m/s²)。
    private static let simulatedShakeMs2 = 8.0

    /// queue の中で呼ぶ。0.1 kcal 増えるごとに画面へ知らせる。
    private func addCalories(_ sample: ScoopSample) {
        calories = stepCalories(calories, sample)
        guard calories.kcal - reportedKcal >= Self.reportStepKcal, let onCalories else { return }
        reportedKcal = calories.kcal
        let kcal = calories.kcal
        Task { @MainActor in onCalories(kcal) }
    }

    /// 端末の外から回数が増えたとき([テスト: 揺れをまねる])に、数えている状態もそろえる。
    func sync(count: Int) {
        queue.addOperation { [weak self] in
            guard let self, count > self.state.count else { return }
            self.state = ScoopState(
                count: count,
                lastT: self.state.lastT,
                gravity: self.state.gravity,
                recent: self.state.recent,
                isAbove: self.state.isAbove,
                lastCountAt: self.state.lastCountAt
            )
        }
    }

    func stop() {
        manager.stopDeviceMotionUpdates()
        queue.addOperation { self.onCalories = nil }
    }
}
