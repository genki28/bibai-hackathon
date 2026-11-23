// 端末に覚えておくもの(UserDefaults)。利用者 ID・名前・音の実況のオン/オフ・依頼ごとのすくった回数。
// LINE のログインは使わないので、初回に「U + 16 進数 32 文字」のランダムな ID を作って保存する。

import Foundation

enum UserStore {
    private static let defaults = UserDefaults.standard
    private static let userIdKey = "helper:userId"
    private static let nameKey = "helper:displayName"
    private static let soundKey = "helper:soundCoachOn"
    private static let scoopPrefix = "helper:scoops:"
    private static let caloriePrefix = "helper:calories:"
    /// 名前の長さの上限(サーバーの MAX_DISPLAY_NAME_LENGTH と同じ)。
    static let maxNameLength = 40

    /// 利用者 ID(なければ作って保存する)。
    static var userId: String {
        if let saved = defaults.string(forKey: userIdKey), isValidUserId(saved) { return saved }
        let created = makeUserId()
        defaults.set(created, forKey: userIdKey)
        return created
    }

    /// 「U + 16 進数 32 文字」のランダムな ID。
    static func makeUserId() -> String {
        "U" + UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased()
    }

    static func isValidUserId(_ value: String) -> Bool {
        value.range(of: "^U[0-9a-f]{32}$", options: .regularExpression) != nil
    }

    static var displayName: String? {
        get { defaults.string(forKey: nameKey) }
        set { defaults.set(newValue, forKey: nameKey) }
    }

    static var isSoundCoachOn: Bool {
        get { defaults.object(forKey: soundKey) as? Bool ?? true }
        set { defaults.set(newValue, forKey: soundKey) }
    }

    /// 依頼ごとのすくった回数(アプリを閉じて開き直しても続きから数える)。
    static func scoopCount(requestId: String) -> Int {
        defaults.integer(forKey: scoopPrefix + requestId)
    }

    static func saveScoopCount(_ count: Int, requestId: String) {
        defaults.set(count, forKey: scoopPrefix + requestId)
    }

    /// 依頼ごとの消費カロリー(kcal。開き直しても続きから数える)。
    static func calories(requestId: String) -> Double {
        defaults.double(forKey: caloriePrefix + requestId)
    }

    static func saveCalories(_ kcal: Double, requestId: String) {
        defaults.set(kcal, forKey: caloriePrefix + requestId)
    }
}
