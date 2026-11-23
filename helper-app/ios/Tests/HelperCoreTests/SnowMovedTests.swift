// みんなで動かした雪と実況のことばのテスト(tests/snow-moved.test.ts と同じ内容)。
import HelperCore
import XCTest

final class TeamScoopsTests: XCTestCase {
    private let helpers = [
        HelperScoops(userId: "me", scoops: 5),
        HelperScoops(userId: "a", scoops: 10),
        HelperScoops(userId: "b", scoops: nil),
    ]

    func test_ほかの人はサーバーの回数_自分は端末の回数を使う() {
        XCTAssertEqual(teamScoops(helpers, myUserId: "me", myCount: 8), 18)
    }

    func test_端末の回数がサーバーより少なければ_サーバーの回数を使う() {
        XCTAssertEqual(teamScoops(helpers, myUserId: "me", myCount: 2), 15)
    }

    func test_参加者の一覧に自分がいなくても_自分の回数を足す() {
        XCTAssertEqual(teamScoops([HelperScoops(userId: "a", scoops: 3)], myUserId: "me", myCount: 4), 7)
    }
}

final class ComparisonTests: XCTestCase {
    func test_届いた中でいちばん大きいたとえ() {
        XCTAssertEqual(comparisonFor(kg: SnowMoved.comparisons[1].kg + 1), SnowMoved.comparisons[1])
    }

    func test_いちばん小さいたとえにも届いていなければnil() {
        XCTAssertNil(comparisonFor(kg: SnowMoved.comparisons[0].kg - 1))
    }
}

final class AnnouncementTests: XCTestCase {
    private func at(_ mine: Int, _ team: Int) -> ScoopCounts { ScoopCounts(mine: mine, team: team) }

    func test_回数が増えていなければ_何も言わない() {
        XCTAssertNil(announcementFor(prev: at(3, 3), next: at(3, 3)))
    }

    func test_自分が10杯ごとに_動かした重さを言う() {
        XCTAssertEqual(announcementFor(prev: at(9, 9), next: at(10, 10)), Announcement(kind: .mine, text: "10杯!約35キロ動かしました"))
    }

    func test_節目でなければ何も言わない() {
        XCTAssertNil(announcementFor(prev: at(10, 10), next: at(11, 11)))
    }

    func test_みんなで50杯ごとに言う_自分の節目より優先() {
        XCTAssertEqual(
            announcementFor(prev: at(19, 49), next: at(20, 50)),
            Announcement(kind: .team, text: "みんなで50杯、約175キロ動かしました!")
        )
    }

    func test_たとえの重さを超えたら_いちばん優先して言う() {
        // 1 杯 3.5kg。29 杯 = 101.5kg で「お米 10 袋ぶん(100kg)」を超える
        XCTAssertEqual(
            announcementFor(prev: at(1, 28), next: at(2, 29)),
            Announcement(kind: .milestone, text: "みんなで\(SnowMoved.comparisons[0].label)の雪を動かしました!")
        )
    }

    func test_ゴールや残りの量は言わない() {
        let texts = (0..<400).map { announcementFor(prev: at($0, $0), next: at($0 + 1, $0 + 1))?.text ?? "" }
        XCTAssertFalse(texts.contains { $0.contains("あと") })
    }
}
