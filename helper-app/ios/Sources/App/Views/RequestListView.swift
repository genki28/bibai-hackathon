// 画面 2「助けに行く(一覧)」: 参加できる依頼を 1 件ずつ出す。押すと確認 →「参加する」で目的地の画面へ。

import SwiftUI

struct RequestListView: View {
    @EnvironmentObject private var app: AppModel
    @State private var requests: [HelpRequest] = []
    @State private var isLoading = true
    @State private var error: String?
    @State private var selected: HelpRequest?
    @State private var isJoining = false

    var body: some View {
        ScreenScaffold {
            ScreenTitle(icon: "runner", text: "助けに行く")
            Text("\(app.displayName) さん、雪かきを待っている家があります")
                .font(.subheadline)
                .frame(maxWidth: .infinity, alignment: .leading)
            ErrorText(message: app.notice)
            ErrorText(message: error)
            if isLoading && requests.isEmpty {
                ProgressView("読み込んでいます…").padding(.top, 24)
            } else if requests.isEmpty {
                PixelCard {
                    IconLabel(icon: "check", text: "いま募集中の雪かきはありません")
                    Text("下に引っぱると読み直します").font(.footnote)
                }
            }
            ForEach(requests) { request in
                Button { selected = request } label: { RequestCard(request: request) }
                    .buttonStyle(.plain)
            }
        }
        .refreshable { await load() }
        .task { await load() }
        .confirmationDialog(
            "この雪かきに参加しますか?",
            isPresented: Binding(get: { selected != nil }, set: { if !$0 { selected = nil } }),
            titleVisibility: .visible,
            presenting: selected
        ) { request in
            Button("参加する") { Task { await join(request) } }
            Button("やめる", role: .cancel) { selected = nil }
        } message: { request in
            Text("\(request.area ?? "美唄市内") ・ 雪 \(request.amount.label) ・ 参加 \(request.joinedCount)/\(request.capacity ?? 5)人")
        }
        .overlay { if isJoining { ProgressView("参加しています…").padding().background(Palette.white) } }
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            requests = try await app.api.listRequests()
            error = nil
        } catch {
            self.error = "読み込めませんでした: \(error.localizedDescription)"
        }
    }

    private func join(_ request: HelpRequest) async {
        isJoining = true
        defer { isJoining = false }
        do {
            let joined = try await app.api.join(id: request.id, userId: app.userId, displayName: app.displayName)
            app.notice = nil
            app.go(.place(joined.id))
        } catch {
            self.error = "参加できませんでした: \(error.localizedDescription)"
        }
    }
}

/// 依頼 1 件のカード(エリア・雪の多さ・参加人数)。
private struct RequestCard: View {
    let request: HelpRequest

    var body: some View {
        PixelCard {
            HStack {
                IconLabel(icon: "house", text: request.area ?? "美唄市内", size: 22)
                    .font(.headline)
                Spacer()
                if request.status == .working {
                    Text("雪かき中").font(.caption.weight(.bold)).padding(4).background(Palette.gold)
                }
            }
            HStack {
                SnowAmountView(amount: request.amount)
                Spacer()
                IconLabel(icon: "cheer", text: "参加 \(request.joinedCount)/\(request.capacity ?? 5)人", size: 16)
                    .font(.footnote.weight(.bold))
            }
            if let tools = request.tools, !tools.isEmpty {
                Text("道具: \(tools)").font(.footnote)
            }
        }
        .contentShape(Rectangle())
    }
}
