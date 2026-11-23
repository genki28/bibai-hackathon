// スコップ計の数え方のテスト(tests/scoop-counter.test.ts と同じ内容)。
import HelperCore
import XCTest

/// 作った波形で確かめる。1 秒に 60 回読む。
private let sampleMs = 1000.0 / 60
private let gravityValue = 9.8

private typealias Wave = (Double) -> Vector3

/// durationMs のあいだ、wave の形の加速度を 1/60 秒ごとに読んだサンプルの列。
private func sampleWave(_ durationMs: Double, _ wave: Wave, includesGravity: Bool = false) -> [ScoopSample] {
    let count = Int(floor(durationMs / sampleMs))
    return (0..<count).map { i in
        let t = Double(i) * sampleMs
        let v = wave(t)
        return ScoopSample(t: t, x: v.x, y: v.y, z: v.z, includesGravity: includesGravity)
    }
}

/// startMs から widthMs の間だけ盛り上がる山(半分の sin)。それ以外は 0。
private func pulse(_ t: Double, _ startMs: Double, _ widthMs: Double, _ height: Double) -> Double {
    let local = t - startMs
    return local >= 0 && local <= widthMs ? height * sin(Double.pi * local / widthMs) : 0
}

/// すくう動き: 2 秒ごとに、0.4 秒の大きな揺れ(12 m/s²)が count 回。
private func scoopWave(_ count: Int) -> Wave {
    { t in
        let x = (0..<count).map { pulse(t, 500 + Double($0) * 2000, 400, 12) }.reduce(0, +)
        return Vector3(x: x, y: 0.4 * sin(t / 37), z: 0.3 * cos(t / 53))
    }
}

final class ScoopCounterTests: XCTestCase {
    func test_すくう動きを10回すると10回と数える() {
        // Arrange
        let samples = sampleWave(21_000, scoopWave(10))
        // Act
        let count = countScoops(samples)
        // Assert
        XCTAssertEqual(count, 10)
    }

    func test_重力込みの加速度でも_すくう動き10回を10回と数える() {
        // Arrange: 縦向き(y に重力)のスマホで、すくう動きが x に出る
        let wave = scoopWave(10)
        let samples = sampleWave(21_000, { t in
            let v = wave(t)
            return Vector3(x: v.x, y: v.y + gravityValue, z: v.z)
        }, includesGravity: true)
        // Act
        let count = countScoops(samples)
        // Assert
        XCTAssertEqual(count, 10)
    }

    func test_小さな揺れは数えない() {
        // Arrange
        let samples = sampleWave(10_000) { t in
            Vector3(
                x: 1.2 * sin(2 * Double.pi * 8 * t / 1000),
                y: 0.8 * cos(2 * Double.pi * 5 * t / 1000),
                z: 0.5 * sin(2 * Double.pi * 3 * t / 1000)
            )
        }
        // Act / Assert
        XCTAssertEqual(countScoops(samples), 0)
    }

    func test_歩く程度の揺れは数えない() {
        // Arrange: 上下に 2.5 m/s²・左右に 1 m/s²、重力込み
        let samples = sampleWave(20_000, { t in
            Vector3(
                x: 1 * sin(2 * Double.pi * 1 * t / 1000),
                y: gravityValue + 2.5 * sin(2 * Double.pi * 2 * t / 1000),
                z: 0.6 * cos(2 * Double.pi * 2 * t / 1000)
            )
        }, includesGravity: true)
        // Act / Assert
        XCTAssertEqual(countScoops(samples), 0)
    }

    func test_押して引く1回の動きは_間隔を空けないので1回と数える() {
        // Arrange: 0.25 秒ずつ、前へ・後ろへ。2 つ目の山は最初の山の 0.3 秒後
        let samples = sampleWave(3000) { t in
            Vector3(x: pulse(t, 500, 250, 12) - pulse(t, 800, 250, 12), y: 0, z: 0)
        }
        // Act
        let count = countScoops(samples)
        // Assert
        XCTAssertEqual(count, 1)
        XCTAssertGreaterThanOrEqual(ScoopCounter.minScoopIntervalMs, 600)
        XCTAssertLessThanOrEqual(ScoopCounter.minScoopIntervalMs, 800)
    }

    func test_回数を引き継いだ状態から数えると_その続きから増える() {
        // Arrange
        let samples = sampleWave(7000, scoopWave(3))
        // Act
        let count = countScoops(samples, from: .from(count: 42))
        // Assert
        XCTAssertEqual(count, 45)
    }

    func test_数字でないサンプルは無視し_状態を変えない() {
        // Arrange
        let bad = ScoopSample(t: 0, x: .nan, y: 0, z: 0)
        // Act
        let next = stepScoop(.empty, bad)
        // Assert
        XCTAssertEqual(next, .empty)
    }

    func test_もとの状態を書き換えない() {
        // Arrange
        let before = ScoopState.from(count: 5)
        let snapshot = before
        // Act
        let after = stepScoop(before, ScoopSample(t: 0, x: 20, y: 0, z: 0))
        // Assert
        XCTAssertEqual(before, snapshot)
        XCTAssertNotEqual(after, before)
    }

    func test_運んだ雪の重さは_回数かける1杯の重さ() {
        XCTAssertEqual(ScoopCounter.kgPerScoop, 3.5)
        XCTAssertEqual(scoopKg(10), 35)
        XCTAssertEqual(scoopKg(0), 0)
        XCTAssertEqual(scoopKg(3), 11)
    }
}
