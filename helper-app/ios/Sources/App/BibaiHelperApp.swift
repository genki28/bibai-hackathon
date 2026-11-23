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
                    .font(.dot(.body))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Palette.white.ignoresSafeArea())
            case .onboarding:
                OnboardingView()
            case .requests, .teams:
                MainTabsView()
            case .identity(let id):
                IdentityView(requestId: id)
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
        .font(.dot(.body))
        .task { await app.launch() }
    }
}

/// 下のタブ「助けに行く / チームの記録」(Web の .tab-bar)。
struct MainTabsView: View {
    @EnvironmentObject private var app: AppModel

    var body: some View {
        VStack(spacing: 0) {
            Group {
                if app.screen == .teams { TeamsView() } else { RequestListView() }
            }
            .frame(maxHeight: .infinity)
            HStack(spacing: 0) {
                tab(.requests, icon: "shovel", text: "助けに行く")
                tab(.teams, icon: "cheer", text: "チームの記録")
            }
            .background(Palette.white.ignoresSafeArea(edges: .bottom))
            .overlay(Rectangle().frame(height: 2).foregroundStyle(Palette.navy), alignment: .top)
        }
        .background(Palette.white.ignoresSafeArea())
    }

    private func tab(_ screen: Screen, icon: String, text: String) -> some View {
        let isSelected = app.screen == screen
        return Button {
            app.go(screen)
        } label: {
            HStack(spacing: 6) {
                Image("icon-\(icon)")
                    .resizable()
                    .renderingMode(.template)
                    .interpolation(.none)
                    .frame(width: 20, height: 20)
                    .accessibilityHidden(true)
                Text(text).font(.dot(.subheadline))
            }
            .frame(maxWidth: .infinity, minHeight: 56)
            .foregroundStyle(isSelected ? Palette.vermilion : Palette.muted)
            .background(Palette.white)
        }
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}
