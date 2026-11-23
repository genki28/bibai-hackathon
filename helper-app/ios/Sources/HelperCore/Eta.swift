// 距離・到着の目安・位置を送る間隔・デモの近づき方(純粋な関数)。
// Web の public/liff/eta.js と public/liff/location-share.js と同じ(テストも tests/eta.test.ts と同じ内容)。

import Foundation

public enum Eta {
    /// 地球の半径(m)。
    static let earthRadiusM = 6_371_008.8
    /// 歩く速さ(km/h)。
    public static let walkingSpeedKmh = 4.8
    static var metersPerMinute: Double { walkingSpeedKmh * 1000 / 60 }
}

/// 位置の共有の決まり(location-share.js と同じ値)。
public enum LocationSharePolicy {
    /// サーバーに送る間隔(秒)。
    public static let sendIntervalSeconds = 15.0
    /// 前に送った位置からこれ以上動いていなければ、送らない(m)。
    public static let minMoveM = 10.0
    /// 動いていなくても、これだけたったら送り直す(ミリ秒)。
    public static let resendMs = 60_000.0
    /// デモ: 最初の位置(家から南西へ約 1km)と、1 回で近づく距離(m)。
    public static let fakeStartOffset = GeoPoint(lat: -0.006, lng: -0.008)
    public static let fakeStepM = 150.0
}

private func radians(_ degrees: Double) -> Double { degrees * Double.pi / 180 }

/// 2 点のまっすぐの距離(m)。ハバーサイン公式。
public func distanceM(_ a: GeoPoint, _ b: GeoPoint) -> Double {
    let dLat = radians(b.lat - a.lat)
    let dLng = radians(b.lng - a.lng)
    let h = pow(sin(dLat / 2), 2) + cos(radians(a.lat)) * cos(radians(b.lat)) * pow(sin(dLng / 2), 2)
    return 2 * Eta.earthRadiusM * asin(min(1, h.squareRoot()))
}

/// 到着までのおおよその分(切り上げ。最低 1 分)。
public func etaMinutes(_ meters: Double) -> Int {
    max(1, Int(ceil(max(0, meters) / Eta.metersPerMinute)))
}

/// 位置が届いてからの分(切り捨て。先の時刻なら 0)。
public func minutesAgo(_ at: Date, now: Date) -> Int {
    max(0, Int(floor(now.timeIntervalSince(at) / 60)))
}

/// 「1 分前の位置」のような文。1 分未満は「たったいまの位置」。
public func locationAgeText(_ at: Date, now: Date) -> String {
    let minutes = minutesAgo(at, now: now)
    return minutes == 0 ? "たったいまの位置" : "\(minutes) 分前の位置"
}

/// 若者 1 人の様子(お年寄りの画面用。Web と同じ結果にするために移してある)。
public enum HelperProgress: Equatable, Sendable {
    case arrived
    case noLocation
    case sharing(minutes: Int?, ageText: String)
}

/// 若者の位置(受け取った時刻つき)。
public struct TimedLocation: Equatable, Sendable {
    public let point: GeoPoint
    public let at: Date

    public init(point: GeoPoint, at: Date) {
        self.point = point
        self.at = at
    }
}

public func helperProgress(arrivedAt: Date?, location: TimedLocation?, home: GeoPoint?, now: Date) -> HelperProgress {
    if arrivedAt != nil { return .arrived }
    guard let location else { return .noLocation }
    let ageText = locationAgeText(location.at, now: now)
    guard let home else { return .sharing(minutes: nil, ageText: ageText) }
    return .sharing(minutes: etaMinutes(distanceM(location.point, home)), ageText: ageText)
}

/// from から to へ stepM(m)だけ近づいた点。残りが stepM 以下なら to。
public func stepToward(_ from: GeoPoint, _ to: GeoPoint, stepM: Double) -> GeoPoint {
    let remaining = distanceM(from, to)
    if remaining <= stepM { return to }
    let ratio = stepM / remaining
    return GeoPoint(lat: from.lat + (to.lat - from.lat) * ratio, lng: from.lng + (to.lng - from.lng) * ratio)
}

/// デモの最初の位置(家から南西へ約 1km)。
public func fakeStartPoint(home: GeoPoint) -> GeoPoint {
    GeoPoint(lat: home.lat + LocationSharePolicy.fakeStartOffset.lat, lng: home.lng + LocationSharePolicy.fakeStartOffset.lng)
}

/// 前に送った位置。
public struct SentLocation: Equatable, Sendable {
    public let point: GeoPoint
    public let timeMs: Double

    public init(point: GeoPoint, timeMs: Double) {
        self.point = point
        self.timeMs = timeMs
    }
}

/// いまの位置を送るべきか(前から 10m 以上動いた・60 秒たった・まだ一度も送っていない)。
public func shouldSendLocation(_ point: GeoPoint, lastSent: SentLocation?, nowMs: Double) -> Bool {
    guard let lastSent else { return true }
    return distanceM(point, lastSent.point) >= LocationSharePolicy.minMoveM
        || nowMs - lastSent.timeMs >= LocationSharePolicy.resendMs
}
