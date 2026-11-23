// 画面 8「チームの記録」(ランキングの代わり。SPEC「第 2 版の変更」7)。
// GET /api/teams/mine/{userId} で、合計の kcal・何回・何人といっしょに と、チームごとのカード。
// [美唄の雪山マップを見る] で {サーバーの URL}/snow-map.html を外のブラウザで開く。

import SwiftUI

struct TeamsView: View {
    @EnvironmentObject private var app: AppModel
    @Environment(\.openURL) private var openURL
    @State private var teams: MyTeams?
    @State private var isLoading = true
    @State private var error: String?

    var body: some View {
        ScreenScaffold {
            ScreenTitle(text: "チームの記録")
            ErrorText(message: error)
            if let teams {
                summary(teams)
                if teams.teams.isEmpty {
                    PixelCard { Text("まだ記録がありません。雪かきに参加すると、ここに残ります。") }
                }
                ForEach(teams.teams) { team in TeamCard(team: team) }
            } else if isLoading {
                ProgressView("読み込んでいます…")
            }
            Button { openSnowMap() } label: { IconLabel(icon: "snowman", text: "美唄の雪山マップを見る") }
                .buttonStyle(.pixelSecondary)
        }
        .refreshable { await load() }
        .task { await load() }
    }

    private func summary(_ teams: MyTeams) -> some View {
        PixelCard {
            Text("あなたのチームで").font(.dot(.subheadline)).foregroundStyle(Palette.muted)
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text("合計").font(.dot(.headline))
                Text(formatKcal(teams.totalCalories)).font(.dot(size: 44, relativeTo: .largeTitle)).foregroundStyle(Palette.vermilion)
                Text("kcal").font(.dot(.headline))
            }
            Text("\(teams.teamCount)回 ・ \(teams.partners)人といっしょに").font(.dot(.body))
        }
    }

    private func openSnowMap() {
        guard let url = app.api.webURL("/snow-map.html") else {
            error = "雪山マップの URL を作れませんでした。"
            return
        }
        openURL(url)
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            teams = try await app.api.myTeams(userId: app.userId)
            error = nil
        } catch {
            self.error = "読み込めませんでした: \(error.localizedDescription)"
        }
    }
}

/// チーム 1 つのカード(いつ・どこ・一緒にやった人・チームの kcal・自分の kcal)。
private struct TeamCard: View {
    let team: MyTeams.Team

    private static let dateFormat: Date.FormatStyle = .dateTime.month().day().hour().minute()

    var body: some View {
        PixelCard {
            HStack {
                Text(ServerDate.parse(team.finishedAt)?.formatted(Self.dateFormat) ?? "").font(.dot(.footnote))
                    .foregroundStyle(Palette.muted)
                Spacer()
                Text(team.area).font(.dot(.footnote)).foregroundStyle(Palette.vermilion)
            }
            Text(team.members.joined(separator: "、")).font(.dot(.headline))
            HStack {
                Text("チーム 約\(formatKcal(team.teamCalories))kcal")
                Spacer()
                Text("あなた 約\(formatKcal(team.myCalories))kcal")
            }
            .font(.dot(.subheadline))
        }
    }
}
