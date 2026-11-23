// 消費カロリーの「数え方」(画面や端末の機能に依存しない純粋な関数)。SPEC「第 2 版の変更」6。
//   1. 揺れの大きさ √(x²+y²+z²)(重力を除いた加速度。m/s²)を、スコップ計と同じ直近 5 サンプルの平均でなめらかにする
//   2. なめらかにした値が 1.5 m/s² 以上なら 5.5 METs(雪かき)、小さければ 2.0 METs(立って休む)
//   3. kcal += METs × 60(kg)× 前のサンプルからの時間(時間)× 1.05
//   4. サンプルの間が 1 秒より空いたら、その間は数えない(なめらかにする途中の値も捨てる)

import Foundation

public enum CalorieMeter {
    /// これ以上の揺れなら雪かき中とみなす(m/s²)。
    public static let activeThreshold = 1.5
    /// 雪かきの METs。
    public static let activeMets = 5.5
    /// 立って休むときの METs。
    public static let restMets = 2.0
    /// 体重(kg。決め打ち)。
    public static let weightKg = 60.0
    /// 補正の係数。
    public static let correction = 1.05
    /// サンプルの間がこれより空いたら数えない(ミリ秒)。
    public static let gapMs = 1000.0
    /// なめらかにするときに平均するサンプルの数(スコップ計と同じ)。
    public static let smoothingSamples = ScoopCounter.smoothingSamples
    /// サーバーに送れる上限(kcal)。
    public static let maxCalories = 5000
    /// 1 時間 = 3,600,000 ミリ秒。
    static let msPerHour = 3_600_000.0
}

/// 消費カロリーの状態。値の型なので、進めても元の状態は変わらない。
public struct CalorieState: Equatable, Sendable {
    public let kcal: Double
    public let lastT: Double?
    public let recent: [Double]

    public init(kcal: Double = 0, lastT: Double? = nil, recent: [Double] = []) {
        self.kcal = kcal
        self.lastT = lastT
        self.recent = recent
    }

    public static let empty = CalorieState()

    /// kcal だけ引き継いだ、はじめの状態(アプリを開き直したとき)。
    public static func from(kcal: Double) -> CalorieState {
        CalorieState(kcal: kcal.isFinite ? max(0, kcal) : 0)
    }
}

/// 1 サンプルぶん進める。サンプルがおかしければ、もとの状態のまま返す。
public func stepCalories(_ state: CalorieState, _ sample: ScoopSample) -> CalorieState {
    guard [sample.t, sample.x, sample.y, sample.z].allSatisfy(\.isFinite) else { return state }
    let dt = state.lastT.map { sample.t - $0 }
    let isGap = dt.map { $0 > CalorieMeter.gapMs || $0 < 0 } ?? true
    let magnitude = (sample.x * sample.x + sample.y * sample.y + sample.z * sample.z).squareRoot()
    let recent = Array(((isGap ? [] : state.recent) + [magnitude]).suffix(CalorieMeter.smoothingSamples))
    guard !isGap, let dt else { return CalorieState(kcal: state.kcal, lastT: sample.t, recent: recent) }
    let smoothed = recent.reduce(0, +) / Double(recent.count)
    let mets = smoothed >= CalorieMeter.activeThreshold ? CalorieMeter.activeMets : CalorieMeter.restMets
    let added = mets * CalorieMeter.weightKg * (dt / CalorieMeter.msPerHour) * CalorieMeter.correction
    return CalorieState(kcal: state.kcal + added, lastT: sample.t, recent: recent)
}

/// サンプルの列をまとめて数える(テスト・確かめ用)。
public func countCalories(_ samples: [ScoopSample], from state: CalorieState = .empty) -> Double {
    samples.reduce(state, stepCalories).kcal
}

/// サーバーに送る値(整数に丸めて 0〜5,000)。
public func caloriesToSend(_ kcal: Double) -> Int {
    guard kcal.isFinite else { return 0 }
    return min(CalorieMeter.maxCalories, max(0, Int(kcal.rounded())))
}
