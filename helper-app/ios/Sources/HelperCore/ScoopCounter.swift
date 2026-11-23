// スコップ計の「数え方」(画面や端末の機能に依存しない純粋な関数)。加速度から、雪をすくった回数を数える。
// Web の public/liff/scoop-counter.js と同じ数え方(テストも tests/scoop-counter.test.ts と同じ内容)。
//   1. 重力を除いた加速度を使う。重力込みなら、ゆっくり追いかける平均(= 重力)を引いて、揺れの分だけにする
//   2. 揺れの大きさ √(x²+y²+z²) を、直近 5 サンプルの平均でなめらかにする
//   3. なめらかにした値が 6 m/s² を超えて山ができ、3 m/s² より下がったら 1 回
//   4. 1 回数えたら 0.7 秒は数えない(同じ動きを 2 回数えない)
//   5. サンプルが 1 秒より長く途切れたら、なめらかにする途中の値を捨ててやり直す

import Foundation

public enum ScoopCounter {
    /// 1 杯の重さ(kg)。
    public static let kgPerScoop = 3.5
    /// これを超えたら「すくう動きの山」が始まった(m/s²)。
    public static let scoopThreshold = 6.0
    /// 山が始まったあと、これより下がったら 1 回と数える(m/s²)。
    public static let releaseThreshold = 3.0
    /// 1 回数えたあと、次を数えない時間(ミリ秒)。
    public static let minScoopIntervalMs = 700.0
    /// なめらかにするときに平均するサンプルの数。
    public static let smoothingSamples = 5
    /// 重力を追いかける速さ(ミリ秒)。
    public static let gravityTimeConstantMs = 1000.0
    /// サンプルがこれより長く途切れたら、やり直す(ミリ秒)。
    public static let gapResetMs = 1000.0
}

/// 3 つの向きの値(加速度など)。
public struct Vector3: Equatable, Sendable {
    public let x: Double
    public let y: Double
    public let z: Double

    public init(x: Double, y: Double, z: Double) {
        self.x = x
        self.y = y
        self.z = z
    }

    var magnitude: Double { (x * x + y * y + z * z).squareRoot() }
    var isFinite: Bool { x.isFinite && y.isFinite && z.isFinite }
}

/// 加速度のサンプル 1 つ。t は時刻(ミリ秒)。includesGravity が true なら重力込みの値。
public struct ScoopSample: Equatable, Sendable {
    public let t: Double
    public let x: Double
    public let y: Double
    public let z: Double
    public let includesGravity: Bool

    public init(t: Double, x: Double, y: Double, z: Double, includesGravity: Bool = false) {
        self.t = t
        self.x = x
        self.y = y
        self.z = z
        self.includesGravity = includesGravity
    }
}

/// スコップ計の状態。値の型なので、進めても元の状態は変わらない。
public struct ScoopState: Equatable, Sendable {
    public let count: Int
    public let lastT: Double?
    public let gravity: Vector3?
    public let recent: [Double]
    public let isAbove: Bool
    public let lastCountAt: Double?

    public init(
        count: Int = 0,
        lastT: Double? = nil,
        gravity: Vector3? = nil,
        recent: [Double] = [],
        isAbove: Bool = false,
        lastCountAt: Double? = nil
    ) {
        self.count = count
        self.lastT = lastT
        self.gravity = gravity
        self.recent = recent
        self.isAbove = isAbove
        self.lastCountAt = lastCountAt
    }

    /// はじめの状態(回数 0)。
    public static let empty = ScoopState()

    /// 回数だけ引き継いだ、はじめの状態(アプリを開き直して、端末に覚えていた回数から続けるとき)。
    public static func from(count: Int) -> ScoopState {
        ScoopState(count: max(0, count))
    }
}

/// 重力の推定を 1 歩進める(ゆっくり追いかける平均)。
private func nextGravity(_ gravity: Vector3?, _ sample: ScoopSample, dt: Double) -> Vector3 {
    guard let gravity else { return Vector3(x: sample.x, y: sample.y, z: sample.z) }
    let alpha = 1 - exp(-dt / ScoopCounter.gravityTimeConstantMs)
    return Vector3(
        x: gravity.x + alpha * (sample.x - gravity.x),
        y: gravity.y + alpha * (sample.y - gravity.y),
        z: gravity.z + alpha * (sample.z - gravity.z)
    )
}

/// 1 サンプルぶん状態を進める。サンプルがおかしければ、もとの状態のまま返す。
public func stepScoop(_ state: ScoopState, _ sample: ScoopSample) -> ScoopState {
    guard [sample.t, sample.x, sample.y, sample.z].allSatisfy(\.isFinite) else { return state }
    let isGap = state.lastT.map { sample.t - $0 > ScoopCounter.gapResetMs || sample.t < $0 } ?? true
    // 途切れたあとは、回数と最後に数えた時刻だけ残してやり直す
    let base = isGap ? ScoopState(count: state.count, lastCountAt: state.lastCountAt) : state
    let dt = isGap ? 0 : sample.t - (state.lastT ?? sample.t)
    let gravity = sample.includesGravity ? nextGravity(base.gravity, sample, dt: dt) : nil
    let motion = gravity.map { Vector3(x: sample.x - $0.x, y: sample.y - $0.y, z: sample.z - $0.z) }
        ?? Vector3(x: sample.x, y: sample.y, z: sample.z)
    let recent = Array((base.recent + [motion.magnitude]).suffix(ScoopCounter.smoothingSamples))
    let smoothed = recent.reduce(0, +) / Double(recent.count)

    func next(isAbove: Bool, count: Int, lastCountAt: Double?) -> ScoopState {
        ScoopState(count: count, lastT: sample.t, gravity: gravity, recent: recent, isAbove: isAbove, lastCountAt: lastCountAt)
    }

    if !base.isAbove {
        return next(isAbove: smoothed > ScoopCounter.scoopThreshold, count: base.count, lastCountAt: base.lastCountAt)
    }
    if smoothed >= ScoopCounter.releaseThreshold {
        return next(isAbove: true, count: base.count, lastCountAt: base.lastCountAt)
    }
    // 山を越えて下がった。間が空いていれば 1 回と数える
    let isTooSoon = base.lastCountAt.map { sample.t - $0 < ScoopCounter.minScoopIntervalMs } ?? false
    if isTooSoon {
        return next(isAbove: false, count: base.count, lastCountAt: base.lastCountAt)
    }
    return next(isAbove: false, count: base.count + 1, lastCountAt: sample.t)
}

/// サンプルの列をまとめて数える(テスト・確かめ用)。
public func countScoops(_ samples: [ScoopSample], from state: ScoopState = .empty) -> Int {
    samples.reduce(state, stepScoop).count
}

/// すくった回数から、運んだ雪の重さ(kg。整数に丸める)。
public func scoopKg(_ count: Int) -> Int {
    Int((Double(max(0, count)) * ScoopCounter.kgPerScoop).rounded())
}
