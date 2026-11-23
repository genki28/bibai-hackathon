// 範囲の記録の「筆で塗る」の計算(純粋な関数)。
// Web の public/liff/brush-area-core.js と同じ(テストも tests/brush-area-core.test.ts と同じ内容)。
// - 筆の線は、家を原点にした m の座標(東 = x、北 = y)で持つ
// - 面積は、塗ったところを 50cm のマス目に分けて、塗られたマスを数える(重ね塗りしても増えない)

import Foundation

public enum BrushArea {
    /// 面積を数えるマス目の 1 辺(m)。
    public static let cellM = 0.5
    /// サーバーが受け付ける面積の上限(㎡)。
    public static let maxAreaM2 = 5000
    /// 筆の太さ(m)。
    public static let thinWidthM = 1.5
    public static let thickWidthM = 4.0
    static let earthRadiusM = 6_371_000.0
}

/// 緯度経度の点。
public struct GeoPoint: Equatable, Sendable, Codable {
    public let lat: Double
    public let lng: Double

    public init(lat: Double, lng: Double) {
        self.lat = lat
        self.lng = lng
    }
}

/// 家からの m の座標(x = 東へ、y = 北へ)。
public struct LocalPoint: Equatable, Sendable {
    public let x: Double
    public let y: Double

    public init(x: Double, y: Double) {
        self.x = x
        self.y = y
    }
}

/// 筆の線 1 本(太さ m と、点の列)。
public struct BrushStroke: Equatable, Sendable {
    public let widthM: Double
    public let points: [LocalPoint]

    public init(widthM: Double, points: [LocalPoint]) {
        self.widthM = widthM
        self.points = points
    }
}

private let degree = Double.pi / 180

/// 緯度経度 → origin(家)からの m。狭い範囲なので、平らな地面とみなす。
public func toLocalMeters(_ point: GeoPoint, origin: GeoPoint) -> LocalPoint {
    let x = (point.lng - origin.lng) * degree * BrushArea.earthRadiusM * cos(origin.lat * degree)
    let y = (point.lat - origin.lat) * degree * BrushArea.earthRadiusM
    return LocalPoint(x: x + 0, y: y + 0)
}

/// 点 p から、線分 a-b までのいちばん近い距離。
private func distanceToSegment(_ p: LocalPoint, _ a: LocalPoint, _ b: LocalPoint) -> Double {
    let dx = b.x - a.x
    let dy = b.y - a.y
    let lengthSq = dx * dx + dy * dy
    let t = lengthSq == 0 ? 0 : max(0, min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq))
    return hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/// マスの番号(東西・南北)。
private struct Cell: Hashable {
    let i: Int
    let j: Int
}

/// 1 本の線分(太さ widthM)が塗るマス。
private func cellsOfSegment(_ a: LocalPoint, _ b: LocalPoint, widthM: Double) -> Set<Cell> {
    let radius = widthM / 2
    let cell = BrushArea.cellM
    let minX = Int(floor((min(a.x, b.x) - radius) / cell))
    let maxX = Int(ceil((max(a.x, b.x) + radius) / cell))
    let minY = Int(floor((min(a.y, b.y) - radius) / cell))
    let maxY = Int(ceil((max(a.y, b.y) + radius) / cell))
    var cells = Set<Cell>()
    for i in minX...maxX {
        for j in minY...maxY {
            // マスの真ん中が筆の中なら、そのマスは塗られたとする
            let center = LocalPoint(x: (Double(i) + 0.5) * cell, y: (Double(j) + 0.5) * cell)
            if distanceToSegment(center, a, b) <= radius { cells.insert(Cell(i: i, j: j)) }
        }
    }
    return cells
}

/// 筆で塗った面積(㎡)。
public func paintedAreaM2(_ strokes: [BrushStroke]) -> Double {
    let cells = strokes.reduce(into: Set<Cell>()) { all, stroke in
        let points = stroke.points
        if points.count == 1 { all.formUnion(cellsOfSegment(points[0], points[0], widthM: stroke.widthM)) }
        for k in points.indices.dropFirst() {
            all.formUnion(cellsOfSegment(points[k - 1], points[k], widthM: stroke.widthM))
        }
    }
    return Double(cells.count) * BrushArea.cellM * BrushArea.cellM
}
