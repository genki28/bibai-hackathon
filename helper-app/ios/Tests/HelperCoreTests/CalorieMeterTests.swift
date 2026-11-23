// 消費カロリーの数え方(SPEC「第 2 版の変更」6)のテスト。
// 揺れ(5 サンプルの平均)が 1.5 m/s² 以上なら 5.5 METs、小さければ 2.0 METs。kcal = METs × 60kg × 時間(h)× 1.05。

import HelperCore
import XCTest

final class CalorieMeterTests: XCTestCase {
    /// 1 秒 50 回(20 ミリ秒ごと)で、同じ大きさの揺れを durationMs のあいだ続けたサンプル列。
    private func steady(magnitude: Double, durationMs: Double, startMs: Double = 0, stepMs: Double = 20) -> [ScoopSample] {
        stride(from: startMs, through: startMs + durationMs, by: stepMs).map { t in
            ScoopSample(t: t, x: magnitude, y: 0, z: 0)
        }
    }

    /// 1 時間あたりの kcal(METs × 60kg × 1.05)。
    private func kcalPerHour(_ mets: Double) -> Double { mets * 60 * 1.05 }

    func test_何もなければ0kcal() {
        XCTAssertEqual(countCalories([]), 0)
        XCTAssertEqual(CalorieState.empty.kcal, 0)
    }

    func test_最初の1サンプルだけでは数えない() {
        XCTAssertEqual(countCalories([ScoopSample(t: 0, x: 5, y: 0, z: 0)]), 0)
    }

    func test_雪かきの揺れを1分続けると_5_5METsで数える() {
        // Arrange: 2 m/s² の揺れを 60 秒
        let samples = steady(magnitude: 2, durationMs: 60_000)
        // Act
        let kcal = countCalories(samples)
        // Assert: 5.5 × 60 × (1/60 時間) × 1.05 = 5.775
        XCTAssertEqual(kcal, kcalPerHour(5.5) / 60, accuracy: 1e-9)
        XCTAssertEqual(kcal, 5.775, accuracy: 1e-9)
    }

    func test_小さい揺れを1分続けると_2_0METsで数える() {
        let kcal = countCalories(steady(magnitude: 1, durationMs: 60_000))
        // 2.0 × 60 × (1/60) × 1.05 = 2.1
        XCTAssertEqual(kcal, 2.1, accuracy: 1e-9)
    }

    func test_ちょうど1_5は雪かき_少しでも下なら休み() {
        let atThreshold = countCalories(steady(magnitude: 1.5, durationMs: 60_000))
        let below = countCalories(steady(magnitude: 1.4999, durationMs: 60_000))
        XCTAssertEqual(atThreshold, 5.775, accuracy: 1e-9)
        XCTAssertEqual(below, 2.1, accuracy: 1e-9)
    }

    func test_60kgと1_05を掛けている() {
        // 1 時間ずっと雪かき = 5.5 × 60 × 1 × 1.05 = 346.5 kcal
        let kcal = countCalories(steady(magnitude: 3, durationMs: 3_600_000, stepMs: 1000))
        XCTAssertEqual(kcal, 346.5, accuracy: 1e-6)
        XCTAssertEqual(CalorieMeter.weightKg, 60)
        XCTAssertEqual(CalorieMeter.correction, 1.05)
    }

    func test_揺れの大きさは5サンプルの平均でなめらかにする() {
        // Arrange: 0 が 4 回のあとに 7 が 1 回 → 平均 1.4(休み)。1 個だけの大きな揺れでは雪かきにしない
        let samples = [0.0, 0, 0, 0, 7].enumerated().map { i, value in
            ScoopSample(t: Double(i) * 1000, x: value, y: 0, z: 0)
        }
        // Act
        let state = samples.reduce(CalorieState.empty, stepCalories)
        // Assert: 4 秒ぶん、すべて 2.0 METs
        XCTAssertEqual(state.kcal, kcalPerHour(2.0) * 4 / 3600, accuracy: 1e-9)
        XCTAssertEqual(state.recent.count, CalorieMeter.smoothingSamples)
    }

    func test_3つの向きの大きさを使う() {
        // √(1² + 1² + 1²) ≈ 1.73 → 雪かき
        let samples = stride(from: 0.0, through: 60_000, by: 20).map { ScoopSample(t: $0, x: 1, y: 1, z: 1) }
        XCTAssertEqual(countCalories(samples), 5.775, accuracy: 1e-9)
    }

    func test_1秒より空いたら_その間は数えない() {
        // Arrange: 0 秒と 1.5 秒の 2 サンプルだけ
        let samples = [ScoopSample(t: 0, x: 2, y: 0, z: 0), ScoopSample(t: 1500, x: 2, y: 0, z: 0)]
        // Act / Assert
        XCTAssertEqual(countCalories(samples), 0)
    }

    func test_ちょうど1秒の間は数える() {
        let samples = [ScoopSample(t: 0, x: 2, y: 0, z: 0), ScoopSample(t: 1000, x: 2, y: 0, z: 0)]
        XCTAssertEqual(countCalories(samples), kcalPerHour(5.5) / 3600, accuracy: 1e-9)
    }

    func test_途切れたあとは_続きから数え直す() {
        // 30 秒 → 5 秒途切れる → 30 秒。途切れた 5 秒は入らない
        let first = steady(magnitude: 2, durationMs: 30_000)
        let second = steady(magnitude: 2, durationMs: 30_000, startMs: 35_000)
        XCTAssertEqual(countCalories(first + second), 5.775, accuracy: 1e-9)
    }

    func test_時刻が戻ったサンプルは数えない() {
        let samples = [ScoopSample(t: 1000, x: 2, y: 0, z: 0), ScoopSample(t: 500, x: 2, y: 0, z: 0)]
        XCTAssertEqual(countCalories(samples), 0)
    }

    func test_おかしな値は無視する() {
        let state = CalorieState(kcal: 1.5, lastT: 0, recent: [2])
        let next = stepCalories(state, ScoopSample(t: 20, x: .nan, y: 0, z: 0))
        XCTAssertEqual(next, state)
    }

    func test_元の状態は変わらない() {
        let state = CalorieState(kcal: 1, lastT: 0, recent: [2])
        _ = stepCalories(state, ScoopSample(t: 20, x: 2, y: 0, z: 0))
        XCTAssertEqual(state.kcal, 1)
        XCTAssertEqual(state.recent, [2])
    }

    func test_開き直したら_覚えていたkcalから続ける() {
        let samples = steady(magnitude: 2, durationMs: 60_000)
        XCTAssertEqual(countCalories(samples, from: .from(kcal: 10)), 15.775, accuracy: 1e-9)
        XCTAssertEqual(CalorieState.from(kcal: -3).kcal, 0)
    }

    func test_送る値は整数で0から5000まで() {
        XCTAssertEqual(caloriesToSend(0), 0)
        XCTAssertEqual(caloriesToSend(5.4), 5)
        XCTAssertEqual(caloriesToSend(5.5), 6)
        XCTAssertEqual(caloriesToSend(-1), 0)
        XCTAssertEqual(caloriesToSend(9_999), 5_000)
        XCTAssertEqual(caloriesToSend(.nan), 0)
    }
}
