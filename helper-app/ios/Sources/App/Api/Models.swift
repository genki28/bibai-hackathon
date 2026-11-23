// サーバーの API が返す形(src/help-requests/views.ts・request-points.ts・ranking.ts と同じ名前)。
// 一覧(大まかな情報だけ)と詳細(参加者にはすべて)を 1 つの型で受けるため、ない項目は nil にしている。

import Foundation
import HelperCore

/// 雪の多さ。
enum SnowAmount: String, Decodable {
    case little
    case normal
    case lots

    /// 画面に出す言葉。
    var label: String {
        switch self {
        case .little: return "すこし"
        case .normal: return "ふつう"
        case .lots: return "たくさん"
        }
    }

    /// 雪の結晶の数(1〜3)。
    var flakes: Int {
        switch self {
        case .little: return 1
        case .normal: return 2
        case .lots: return 3
        }
    }
}

/// 依頼の状態。waiting(募集中)→ accepted(だれか参加)→ working(雪かき中)→ done(終了)。cancelled は取り消し。
enum RequestStatus: String, Decodable {
    case waiting
    case accepted
    case working
    case done
    case cancelled
}

/// 参加した若者。
struct Helper: Decodable, Identifiable, Equatable {
    let userId: String
    let displayName: String
    let joinedAt: String?
    let arrivedAt: String?
    let scoops: Int?

    var id: String { userId }
}

/// 雪かきの依頼(一覧・詳細のどちらも)。
struct HelpRequest: Decodable, Identifiable, Equatable {
    let id: String
    let status: RequestStatus
    let amount: SnowAmount
    let area: String?
    let name: String?
    let address: String?
    let lat: Double?
    let lng: Double?
    let approxLat: Double?
    let approxLng: Double?
    let depth: String?
    let tools: String?
    let createdAt: String?
    let helperCount: Int?
    let capacity: Int?
    let helpers: [Helper]?
    let leaderUserId: String?
    let startedAt: String?
    let finishedAt: String?

    /// 美唄市の中心あたり(位置がない依頼に使う。src/help-requests/views.ts の BIBAI_CENTER と同じ)。
    static let bibaiCenter = GeoPoint(lat: 43.33, lng: 141.853)

    var allHelpers: [Helper] { helpers ?? [] }
    var joinedCount: Int { helperCount ?? allHelpers.count }

    /// 家の位置(なければ大まかな位置、それもなければ美唄の中心)。
    var home: GeoPoint {
        if let lat, let lng { return GeoPoint(lat: lat, lng: lng) }
        if let approxLat, let approxLng { return GeoPoint(lat: approxLat, lng: approxLng) }
        return Self.bibaiCenter
    }

    func helper(_ userId: String) -> Helper? { allHelpers.first { $0.userId == userId } }
    func hasArrived(_ userId: String) -> Bool { helper(userId)?.arrivedAt != nil }
    var leaderName: String { allHelpers.first { $0.userId == leaderUserId }?.displayName ?? "リーダー" }
    /// 範囲を記録して終われるか(リーダー。リーダーがいない古い依頼はだれでも)。
    func canFinish(_ userId: String) -> Bool { leaderUserId == nil || leaderUserId == userId }
}

/// 合言葉。
struct ArrivalCode: Decodable {
    let code: String
}

/// お疲れ様の画面のポイント。
struct RequestPoints: Decodable, Equatable {
    struct Reunion: Decodable, Equatable {
        let points: Int
        let partners: [String]
    }

    struct Scoops: Decodable, Equatable {
        let mine: Int
        let total: Int
    }

    let workPoints: Int
    let stars: Int?
    let ratingPoints: Int
    let reunion: Reunion
    let firstFinishBonus: Int
    let total: Int
    let scoops: Scoops
}

/// ランキングの 1 行。
struct RankingEntry: Decodable, Identifiable, Equatable {
    let rank: Int
    let displayName: String
    let points: Int
    let isMe: Bool

    var id: String { "\(rank)-\(displayName)-\(points)" }
}

/// ランキングの期間。
enum RankingPeriod: String, CaseIterable, Identifiable {
    case daily
    case total

    var id: String { rawValue }
    var label: String { self == .daily ? "今日" : "これまで" }
}

/// サーバーの時刻(ISO 形式。ミリ秒つきも、なしも)を読む。
enum ServerDate {
    private static let withFraction: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private static let plain = ISO8601DateFormatter()

    static func parse(_ text: String?) -> Date? {
        guard let text else { return nil }
        return withFraction.date(from: text) ?? plain.date(from: text)
    }
}
