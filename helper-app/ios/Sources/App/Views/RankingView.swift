// 画面 8「ランキング」: 今日 / これまでの切り替え。順位・名前・ポイント。自分の行は目立たせる。

import SwiftUI

struct RankingView: View {
    @EnvironmentObject private var app: AppModel
    @State private var period: RankingPeriod = .daily
    @State private var entries: [RankingEntry] = []
    @State private var isLoading = true
    @State private var error: String?

    var body: some View {
        ScreenScaffold {
            ScreenTitle(icon: "crown", text: "ランキング")
            Picker("期間", selection: $period) {
                ForEach(RankingPeriod.allCases) { Text($0.label).tag($0) }
            }
            .pickerStyle(.segmented)
            ErrorText(message: error)
            if isLoading && entries.isEmpty {
                ProgressView("読み込んでいます…")
            } else if entries.isEmpty {
                PixelCard { Text(period == .daily ? "今日はまだだれもポイントがありません" : "まだだれもポイントがありません") }
            }
            VStack(spacing: 6) {
                ForEach(entries) { entry in row(entry) }
            }
        }
        .refreshable { await load() }
        .task(id: period) { await load() }
    }

    private func row(_ entry: RankingEntry) -> some View {
        HStack(spacing: 10) {
            Text("\(entry.rank)").font(.system(.title3, design: .monospaced).weight(.heavy)).frame(width: 36)
            if entry.rank == 1 { PixelIcon(name: "crown", size: 20) }
            Text(entry.isMe ? "\(entry.displayName)(あなた)" : entry.displayName)
                .font(.headline).lineLimit(1)
            Spacer()
            Text("\(entry.points.formatted()) pt").font(.body.weight(.bold))
        }
        .padding(10)
        .background(entry.isMe ? Palette.gold : Palette.white)
        .overlay(Rectangle().stroke(Palette.navy, lineWidth: entry.isMe ? 3 : 2))
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            entries = try await app.api.ranking(period: period, userId: app.userId)
            error = nil
        } catch {
            self.error = "読み込めませんでした: \(error.localizedDescription)"
        }
    }
}
