// 筆の面積のテスト(tests/brush-area-core.test.ts と同じ内容)。
import HelperCore
import XCTest

private let origin = GeoPoint(lat: 43.33, lng: 141.853)

final class ToLocalMetersTests: XCTestCase {
    func test_同じ点は0() {
        XCTAssertEqual(toLocalMeters(origin, origin: origin), LocalPoint(x: 0, y: 0))
    }

    func test_北へ0_001度は_約111m上() {
        let p = toLocalMeters(GeoPoint(lat: origin.lat + 0.001, lng: origin.lng), origin: origin)
        XCTAssertEqual(p.x, 0, accuracy: 0.005)
        XCTAssertGreaterThan(p.y, 110)
        XCTAssertLessThan(p.y, 112)
    }

    func test_東へ進むとxが増える() {
        // 北海道では経度 0.001 度 ≒ 81m
        let p = toLocalMeters(GeoPoint(lat: origin.lat, lng: origin.lng + 0.001), origin: origin)
        XCTAssertGreaterThan(p.x, 80)
        XCTAssertLessThan(p.x, 82)
    }
}

final class PaintedAreaTests: XCTestCase {
    private let line = BrushStroke(widthM: 2, points: [LocalPoint(x: 0, y: 0), LocalPoint(x: 10, y: 0)])

    func test_何も塗っていなければ0() {
        XCTAssertEqual(paintedAreaM2([]), 0)
    }

    func test_太さ2m長さ10mのまっすぐな線は_約2かける10と両端の丸() {
        let area = paintedAreaM2([line])
        XCTAssertGreaterThan(area, 21)
        XCTAssertLessThan(area, 25)
    }

    func test_同じところを2回塗っても_面積は増えない() {
        XCTAssertEqual(paintedAreaM2([line, line]), paintedAreaM2([line]), accuracy: 0.005)
    }

    func test_離れた2本の線は_足し算になる() {
        let b = BrushStroke(widthM: 2, points: [LocalPoint(x: 0, y: 20), LocalPoint(x: 10, y: 20)])
        // toBeCloseTo(…, 0) は 0.5 未満の差
        XCTAssertEqual(paintedAreaM2([line, b]), paintedAreaM2([line]) * 2, accuracy: 0.5)
    }

    func test_1点だけ押したときも_筆の丸の広さになる() {
        let dot = BrushStroke(widthM: 4, points: [LocalPoint(x: 0, y: 0)])
        // 半径 2m の円 ≒ 12.6㎡
        XCTAssertGreaterThan(paintedAreaM2([dot]), 11)
        XCTAssertLessThan(paintedAreaM2([dot]), 14)
    }

    func test_マス目の細かさは50cm() {
        XCTAssertEqual(BrushArea.cellM, 0.5)
    }
}
