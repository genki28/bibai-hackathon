// 本人確認の画面(SPEC「第 2 版の変更」5)。Web と同じ仕組みで、アプリの中のブラウザ(WKWebView)で
// {サーバーの URL}/liff/identity.html?appUserId={利用者 ID}&appName={名前} を開く。顔の照合はその画面がスマホの中で行う。
// 2 秒ごとに GET /api/identity/{userId} を読み、verified: true になったら閉じて目的地へ。
// その画面の下に [テスト: 本人確認をスキップ] がある(Web の画面のボタン)。

import SwiftUI
import WebKit

struct IdentityView: View {
    let requestId: String
    @EnvironmentObject private var app: AppModel
    @State private var error: String?

    /// 確認できたかを読み直す間隔(ナノ秒)。
    private static let pollNanoseconds: UInt64 = 2_000_000_000

    private var pageURL: URL? {
        app.api.webURL("/liff/identity.html", query: ["appUserId": app.userId, "appName": app.displayName])
    }

    var body: some View {
        VStack(spacing: 0) {
            Rectangle().fill(Palette.navy).frame(height: 4)
            ErrorText(message: error).padding(.horizontal, 24)
            if let pageURL {
                IdentityWebView(url: pageURL).accessibilityIdentifier("identity-web")
            } else {
                Spacer()
            }
        }
        .background(Palette.white.ignoresSafeArea())
        .task { await waitForVerified() }
    }

    private func waitForVerified() async {
        while !Task.isCancelled {
            // アプリを閉じている間は読み直さない
            guard app.isForeground else {
                try? await Task.sleep(nanoseconds: Self.pollNanoseconds)
                continue
            }
            do {
                if try await app.api.identityStatus(userId: app.userId).verified {
                    app.go(.place(requestId))
                    return
                }
                error = nil
            } catch {
                self.error = "本人確認の状態を読めませんでした: \(error.localizedDescription)"
            }
            try? await Task.sleep(nanoseconds: Self.pollNanoseconds)
        }
    }
}

/// カメラを使える WKWebView(身分証と自撮りを撮るため)。
private struct IdentityWebView: UIViewRepresentable {
    let url: URL

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        // 自撮りの映像を画面の中で流す(全画面にしない)、押さなくても映像を流せる
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        let view = WKWebView(frame: .zero, configuration: config)
        view.uiDelegate = context.coordinator
        view.load(URLRequest(url: url))
        return view
    }

    func updateUIView(_ view: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKUIDelegate {
        /// カメラの許可を聞かれたら、同じサーバーの画面にだけ許す(アプリのカメラの許可は iOS が別に聞く)。
        func webView(
            _ webView: WKWebView,
            requestMediaCapturePermissionFor origin: WKSecurityOrigin,
            initiatedByFrame frame: WKFrameInfo,
            type: WKMediaCaptureType,
            decisionHandler: @escaping (WKPermissionDecision) -> Void
        ) {
            let base = ApiClient.configuredBase()
            let isSameHost = origin.host == base.host && origin.protocol == base.scheme
            decisionHandler(isSameHost ? .grant : .prompt)
        }
    }
}
