// アプリの入り口。いまの画面(AppModel.screen)に合わせて、画面を切り替える。

import SwiftUI

@main
struct BibaiHelperApp: App {
    @StateObject private var app = AppModel()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(app)
                .environmentObject(app.session)
                .tint(Palette.vermilion)
                .preferredColorScheme(.light)
        }
    }
}

struct RootView: View {
    @EnvironmentObject private var app: AppModel

    var body: some View {
        Group {
            switch app.screen {
            case .loading:
                ProgressView("読み込んでいます…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Palette.ice.ignoresSafeArea())
            case .onboarding:
                OnboardingView()
            case .requests, .ranking:
                MainTabsView()
            case .place(let id):
                PlaceView(requestId: id)
            case .arrival(let id):
                ArrivalView(requestId: id)
            case .gather(let id):
                GatherView(requestId: id)
            case .working(let id):
                WorkingView(requestId: id)
            case .area(let id):
                AreaView(requestId: id)
            case .finish(let id):
                FinishView(requestId: id)
            }
        }
        .task { await app.launch() }
    }
}

/// 下のタブ「助けに行く / ランキング」。
struct MainTabsView: View {
    @EnvironmentObject private var app: AppModel

    var body: some View {
        VStack(spacing: 0) {
            Group {
                if app.screen == .ranking { RankingView() } else { RequestListView() }
            }
            .frame(maxHeight: .infinity)
            HStack(spacing: 0) {
                tab(.requests, icon: "runner", text: "助けに行く")
                tab(.ranking, icon: "crown", text: "ランキング")
            }
            .background(Palette.white)
            .overlay(Rectangle().frame(height: 3).foregroundStyle(Palette.navy), alignment: .top)
        }
        .background(Palette.ice.ignoresSafeArea())
    }

    private func tab(_ screen: Screen, icon: String, text: String) -> some View {
        let isSelected = app.screen == screen
        return Button {
            app.go(screen)
        } label: {
            VStack(spacing: 2) {
                PixelIcon(name: icon, size: 24)
                Text(text).font(.caption.weight(.bold))
            }
            .frame(maxWidth: .infinity, minHeight: 56)
            .foregroundStyle(Palette.navy)
            .background(isSelected ? Palette.gold : Palette.white)
        }
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}
