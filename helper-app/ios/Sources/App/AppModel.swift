// アプリ全体の状態(いまどの画面か・利用者)と、画面の移り方。
// アプリを開いたら、まず「続きがあるか」を調べて、状態に合わせた画面へ進む(SPEC の「画面と流れ」)。

import Foundation
import SwiftUI

/// 画面。依頼の画面は依頼 ID を持つ。
enum Screen: Equatable {
    case loading
    case onboarding
    case requests
    case ranking
    case place(String)
    case arrival(String)
    case gather(String)
    case working(String)
    case area(String)
    case finish(String)
}

@MainActor
final class AppModel: ObservableObject {
    @Published private(set) var screen: Screen = .loading
    @Published private(set) var displayName: String
    /// 続きを調べたときの失敗(一覧の画面に出す)。
    @Published var notice: String?

    let userId: String
    let api: ApiClient
    let session: HelperSession

    init(api: ApiClient = .shared) {
        let userId = UserStore.userId
        self.userId = userId
        self.api = api
        displayName = UserStore.displayName ?? ""
        session = HelperSession(userId: userId, api: api)
    }

    /// 起動したとき。名前がなければ「はじめに」、あれば続きを調べる。
    func launch() async {
        guard !displayName.isEmpty else {
            screen = .onboarding
            return
        }
        await resume()
    }

    func saveName(_ name: String) async {
        let trimmed = String(name.trimmingCharacters(in: .whitespacesAndNewlines).prefix(UserStore.maxNameLength))
        guard !trimmed.isEmpty else { return }
        UserStore.displayName = trimmed
        displayName = trimmed
        await resume()
    }

    /// 続きがあるか調べて、状態に合わせた画面へ進む。なければ一覧。
    func resume() async {
        do {
            guard let active = try await api.activeRequest(userId: userId) else {
                go(.requests)
                return
            }
            go(Self.screen(for: active, userId: userId))
        } catch {
            notice = "続きを調べられませんでした: \(error.localizedDescription)"
            go(.requests)
        }
    }

    /// 依頼の状態から、進む画面を決める(参加中で未到着 → 3、到着済みで開始前 → 4、雪かき中 → 5、終わった → 7)。
    static func screen(for request: HelpRequest, userId: String) -> Screen {
        switch request.status {
        case .accepted, .waiting:
            return request.hasArrived(userId) ? .gather(request.id) : .place(request.id)
        case .working:
            return .working(request.id)
        case .done:
            return .finish(request.id)
        case .cancelled:
            return .requests
        }
    }

    /// 画面を移る。お疲れ様・一覧・ランキングに移ったら、裏で動かしているものを止める。
    func go(_ next: Screen) {
        switch next {
        case .finish, .requests, .ranking, .onboarding:
            session.endAll()
        default:
            break
        }
        withAnimation(.easeInOut(duration: 0.2)) { screen = next }
    }
}
