// 雪かき中の「みんなで動かした雪」と「音の実況のことば」の決まり(純粋な関数)。
// Web の public/liff/snow-moved.js と同じ(テストも tests/snow-moved.test.ts と同じ内容)。
// - 雪の総量は分からないので、「あと少し」のような残りやゴールは言わない
// - 実況のことばは、回数が節目を超えた瞬間だけ。同時に複数なら、いちばん大事な 1 つだけ
//   (たとえの重さを超えた > みんなで 50 杯ごと > 自分の 10 杯ごと)

import Foundation

public enum SnowMoved {
    /// 自分の回数を読み上げる間隔(杯)。
    public static let mineStep = 10
    /// みんなの回数を読み上げる間隔(杯)。
    public static let teamStep = 50

    /// 動かした雪の重さのたとえ(軽い順)。
    public static let comparisons: [Comparison] = [
        Comparison(kg: 100, label: "お米 10 袋ぶん"),
        Comparison(kg: 300, label: "グランドピアノ 1 台ぶん"),
        Comparison(kg: 700, label: "軽自動車 1 台ぶん"),
        Comparison(kg: 1500, label: "ふつうの車 1 台ぶん"),
    ]
}

/// 重さのたとえ。
public struct Comparison: Equatable, Sendable {
    public let kg: Int
    public let label: String
}

/// 参加者 1 人のすくった回数(サーバーの値。なければ nil)。
public struct HelperScoops: Equatable, Sendable {
    public let userId: String
    public let scoops: Int?

    public init(userId: String, scoops: Int?) {
        self.userId = userId
        self.scoops = scoops
    }
}

/// 自分とみんなの回数。
public struct ScoopCounts: Equatable, Sendable {
    public let mine: Int
    public let team: Int

    public init(mine: Int, team: Int) {
        self.mine = mine
        self.team = team
    }
}

/// 実況のことば。
public struct Announcement: Equatable, Sendable {
    public enum Kind: String, Sendable {
        case milestone
        case team
        case mine
    }

    public let kind: Kind
    public let text: String

    public init(kind: Kind, text: String) {
        self.kind = kind
        self.text = text
    }
}

/// みんなのすくった回数。ほかの人はサーバーの回数、自分は端末の回数(サーバーより少なければサーバーの回数)。
public func teamScoops(_ helpers: [HelperScoops], myUserId: String, myCount: Int) -> Int {
    let others = helpers.filter { $0.userId != myUserId }.reduce(0) { $0 + ($1.scoops ?? 0) }
    let myServerCount = helpers.first { $0.userId == myUserId }?.scoops ?? 0
    return others + max(myCount, myServerCount)
}

/// 動かした重さが届いた中で、いちばん大きいたとえ。どれにも届いていなければ nil。
public func comparisonFor(kg: Int) -> Comparison? {
    SnowMoved.comparisons.last { kg >= $0.kg }
}

/// 回数が step の倍数をまたいだら、そのいちばん大きい倍数。またいでいなければ nil。
private func crossedStep(before: Int, after: Int, step: Int) -> Int? {
    let reached = (after / step) * step
    return after > before && reached > before && reached > 0 ? reached : nil
}

/// 回数が変わったときの実況のことば。言うことがなければ nil。
public func announcementFor(prev: ScoopCounts, next: ScoopCounts) -> Announcement? {
    let before = comparisonFor(kg: scoopKg(prev.team))
    let after = comparisonFor(kg: scoopKg(next.team))
    if let after, after != before {
        return Announcement(kind: .milestone, text: "みんなで\(after.label)の雪を動かしました!")
    }
    if let team = crossedStep(before: prev.team, after: next.team, step: SnowMoved.teamStep) {
        return Announcement(kind: .team, text: "みんなで\(team)杯、約\(scoopKg(team))キロ動かしました!")
    }
    if let mine = crossedStep(before: prev.mine, after: next.mine, step: SnowMoved.mineStep) {
        return Announcement(kind: .mine, text: "\(mine)杯!約\(scoopKg(mine))キロ動かしました")
    }
    return nil
}
