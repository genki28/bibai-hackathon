// 手元のサーバー(http://localhost:3000)で、雪かき中の画面の [🧪 揺れをまねる] を押して、回数がサーバーに届くかを確かめる UI テスト。
// ふだんの `xcodebuild test`(単体テスト)には入れていない(サーバーが要るため)。
// 事前に、手元のサーバーで「この利用者が参加して、到着して、雪かきを始めた依頼」を API で作っておき、
// 利用者 ID を環境変数で渡して動かす(TEST_RUNNER_ を付けると、テストに渡る):
//   TEST_RUNNER_UITEST_USER_ID=U〜 xcodebuild test -scheme BibaiHelperUITests -destination '…'

import XCTest

final class WorkingFlowUITests: XCTestCase {
    func test_揺れをまねるを押すと_回数が増えてサーバーに送られる() throws {
        let env = ProcessInfo.processInfo.environment
        let userId = try XCTUnwrap(env["UITEST_USER_ID"], "UITEST_USER_ID を指定してください")
        let app = XCUIApplication()
        app.launchArguments = [
            "-BibaiApiBase", env["UITEST_API_BASE"] ?? "http://localhost:3000",
            "-helper:userId", userId,
            "-helper:displayName", "ゆき",
        ]
        app.launch()

        let fake = app.buttons["揺れをまねる"]
        XCTAssertTrue(fake.waitForExistence(timeout: 20), "雪かき中の画面が出ませんでした")
        // 端末に覚えた回数の続きから増える(はじめが何杯でも確かめられるように、押す前の回数を読む)
        let mine = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'あなた: '")).firstMatch
        XCTAssertTrue(mine.waitForExistence(timeout: 5))
        let before = Int(mine.label.dropFirst("あなた: ".count).prefix { $0.isNumber }) ?? -1
        for _ in 0..<3 { fake.tap() }
        let after = before + 3
        let afterKg = Int((Double(after) * 3.5).rounded())
        XCTAssertTrue(app.staticTexts["あなた: \(after)杯(約\(afterKg)kg)"].waitForExistence(timeout: 5))
        // 10 秒ごとの送信を待つ(サーバー側の回数は、テストを動かした人が API で確かめる)
        sleep(12)

        // 雪かきを終える → 範囲を筆で塗る → 完了 → お疲れ様(この利用者がリーダーのとき)
        app.buttons["雪かきを終える"].tap()
        XCTAssertTrue(app.staticTexts["範囲を記録"].waitForExistence(timeout: 10))
        let window = app.windows.firstMatch
        let from = window.coordinate(withNormalizedOffset: CGVector(dx: 0.3, dy: 0.3))
        let to = window.coordinate(withNormalizedOffset: CGVector(dx: 0.7, dy: 0.35))
        from.press(forDuration: 0.1, thenDragTo: to)
        let complete = app.buttons["雪かきを完了する"]
        XCTAssertTrue(complete.waitForExistence(timeout: 5))
        XCTAssertTrue(complete.isEnabled, "塗ったのに完了できません")
        complete.tap()
        XCTAssertTrue(app.staticTexts["CLEAR"].waitForExistence(timeout: 15))
    }
}
