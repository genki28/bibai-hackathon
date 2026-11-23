// 距離・到着の目安・デモの近づき方のテスト(tests/eta.test.ts と同じ内容 + 位置を送る間隔)。
import HelperCore
import XCTest

/// 美唄あたり。緯度 0.01 度 ≒ 1,112m
private let home = GeoPoint(lat: 43.33, lng: 141.853)
private let now = ISO8601DateFormatter().date(from: "2026-11-23T07:00:00Z")!
private func minutesBefore(_ minutes: Double) -> Date { now.addingTimeInterval(-minutes * 60) }

final class DistanceTests: XCTestCase {
    func test_緯度が0_01度ちがうと_およそ1112m() {
        let meters = distanceM(home, GeoPoint(lat: home.lat + 0.01, lng: home.lng))
        XCTAssertGreaterThan(meters, 1100)
        XCTAssertLessThan(meters, 1125)
    }

    func test_同じ点なら0m() {
        XCTAssertEqual(distanceM(home, home), 0)
    }
}

final class EtaMinutesTests: XCTestCase {
    func test_400mは歩く速さ4_8kmhで5分() {
        XCTAssertEqual(etaMinutes(400), 5)
    }

    func test_端数は切り上げる() {
        XCTAssertEqual(etaMinutes(401), 6)
    }

    func test_すぐ近くでも最低1分() {
        XCTAssertEqual(etaMinutes(0), 1)
    }
}

final class LocationAgeTests: XCTestCase {
    func test_1分30秒前なら1分前の位置() {
        XCTAssertEqual(locationAgeText(now.addingTimeInterval(-90), now: now), "1 分前の位置")
    }

    func test_1分未満ならたったいまの位置() {
        XCTAssertEqual(locationAgeText(now.addingTimeInterval(-20), now: now), "たったいまの位置")
    }

    func test_時計のずれで先の時刻になっていても0分として扱う() {
        XCTAssertEqual(minutesAgo(now.addingTimeInterval(120), now: now), 0)
    }
}

final class HelperProgressTests: XCTestCase {
    func test_到着した人はarrived() {
        let progress = helperProgress(
            arrivedAt: minutesBefore(1),
            location: TimedLocation(point: home, at: minutesBefore(2)),
            home: home,
            now: now
        )
        XCTAssertEqual(progress, .arrived)
    }

    func test_位置がない人はnoLocation() {
        XCTAssertEqual(helperProgress(arrivedAt: nil, location: nil, home: home, now: now), .noLocation)
    }

    func test_位置があれば_到着の目安と何分前の位置を出す() {
        // 家から北へ約 1,112m → 1112 ÷ 80 = 13.9 → 14 分
        let location = TimedLocation(point: GeoPoint(lat: home.lat + 0.01, lng: home.lng), at: minutesBefore(2))
        XCTAssertEqual(
            helperProgress(arrivedAt: nil, location: location, home: home, now: now),
            .sharing(minutes: 14, ageText: "2 分前の位置")
        )
    }

    func test_家の位置がないときは到着の目安を出さない() {
        let location = TimedLocation(point: home, at: minutesBefore(0))
        XCTAssertEqual(
            helperProgress(arrivedAt: nil, location: location, home: nil, now: now),
            .sharing(minutes: nil, ageText: "たったいまの位置")
        )
    }
}

final class StepTowardTests: XCTestCase {
    func test_150m近づくと_残りの距離が150m減る() {
        let from = GeoPoint(lat: home.lat - 0.01, lng: home.lng)
        let before = distanceM(from, home)
        let next = stepToward(from, home, stepM: 150)
        XCTAssertEqual(before - distanceM(next, home), 150, accuracy: 0.5)
    }

    func test_残りが近づく距離より短ければ_ちょうど家に着く() {
        let from = GeoPoint(lat: home.lat + 0.0005, lng: home.lng)
        XCTAssertEqual(stepToward(from, home, stepM: 150), home)
    }

    func test_デモの最初の位置は家から南西へ約1km() {
        let start = fakeStartPoint(home: home)
        XCTAssertEqual(start.lat, home.lat - 0.006, accuracy: 1e-9)
        XCTAssertEqual(start.lng, home.lng - 0.008, accuracy: 1e-9)
        XCTAssertGreaterThan(distanceM(start, home), 900)
        XCTAssertLessThan(distanceM(start, home), 1100)
    }
}

final class LocationSendPolicyTests: XCTestCase {
    private let last = SentLocation(point: home, timeMs: 0)

    func test_まだ送っていなければ送る() {
        XCTAssertTrue(shouldSendLocation(home, lastSent: nil, nowMs: 0))
    }

    func test_ほとんど動かず60秒たっていなければ送らない() {
        XCTAssertFalse(shouldSendLocation(GeoPoint(lat: home.lat + 0.00005, lng: home.lng), lastSent: last, nowMs: 15_000))
    }

    func test_10m以上動いたら送る() {
        XCTAssertTrue(shouldSendLocation(GeoPoint(lat: home.lat + 0.0001, lng: home.lng), lastSent: last, nowMs: 15_000))
    }

    func test_動いていなくても60秒たったら送る() {
        XCTAssertTrue(shouldSendLocation(home, lastSent: last, nowMs: 60_000))
    }
}
