// スコップ計の「センサーの部分」(CoreMotion)。数え方は HelperCore の stepScoop。
// - deviceMotion.userAcceleration(重力を除いた値。単位は G)に 9.81 を掛けて m/s² にする。1 秒 50 回
// - 画面を閉じても、位置の裏での利用でアプリが動き続けるので、そのまま読み続ける
// - シミュレータでは加速度が出ない([🧪 揺れをまねる] で数える)

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

    var isAvailable: Bool { manager.isDeviceMotionAvailable }

    /// 読み始める。回数が増えたら onCount(新しい回数)をメインスレッドで呼ぶ。
    func start(from count: Int, onCount: @escaping @MainActor (Int) -> Void) {
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
        }
    }

    /// 端末の外から回数が増えたとき([🧪 揺れをまねる])に、数えている状態もそろえる。
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
    }
}
