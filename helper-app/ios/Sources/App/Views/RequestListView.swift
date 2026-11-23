// 画面 2「助けに行く(一覧)」: 参加できる依頼を 1 件ずつ出す。
// カードを押すと、そのカードが下に伸びて「この雪かきに参加しますか?」と [参加する] [やめておく] を出す(SPEC「第 2 版の変更」1)。
// 「参加する」で参加 → 本人確認(まだなら)→ 目的地の画面へ。

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
            ScreenTitle(text: "雪かきに参加")
            Image("pixel-town")
                .resizable()
                .interpolation(.none)
                .aspectRatio(3, contentMode: .fit)
                .overlay(Rectangle().fill(Palette.navy).frame(height: 2), alignment: .bottom)
                .accessibilityHidden(true)
            Text("\(app.displayName) さん、雪かきを待っている家があります")
                .font(.dot(.subheadline))
                .frame(maxWidth: .infinity, alignment: .leading)
            ErrorText(message: app.notice)
            ErrorText(message: error)
            if !isLoading && requests.isEmpty {
                PixelCard {
                    IconLabel(icon: "check", text: "いま募集中の雪かきはありません")
                    Text("下に引っぱると読み直します").font(.dot(.footnote))
                }
            }
            ForEach(requests) { request in
                RequestCard(
                    request: request,
                    isExpanded: selected?.id == request.id,
                    isJoining: isJoining,
                    onTap: { toggle(request) },
                    onJoin: { Task { await join(request) } },
                    onCancel: { withAnimation(.easeInOut(duration: 0.2)) { selected = nil } }
                )
            }
        }
        .refreshable { await load() }
        .task { await load() }
        .loadingOverlay(isLoading && requests.isEmpty)
    }

    private func toggle(_ request: HelpRequest) {
        withAnimation(.easeInOut(duration: 0.2)) {
            selected = selected?.id == request.id ? nil : request
        }
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
            try await app.whileBusy {
                let joined = try await app.api.join(id: request.id, userId: app.userId, displayName: app.displayName)
                app.notice = nil
                await app.afterJoin(joined.id)
            }
        } catch {
            self.error = "参加できませんでした: \(error.localizedDescription)"
        }
    }
}

/// 依頼 1 件のカード(エリア・雪の多さ・参加人数)。押すと下に伸びて、参加の確認を出す。
private struct RequestCard: View {
    let request: HelpRequest
    let isExpanded: Bool
    let isJoining: Bool
    let onTap: () -> Void
    let onJoin: () -> Void
    let onCancel: () -> Void

    var body: some View {
        PixelCard {
            Button(action: onTap) { summary }
                .buttonStyle(.plain)
                .accessibilityHint(isExpanded ? "" : "押すと参加の確認が出ます")
            if isExpanded { confirm }
        }
    }

    private var summary: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Rectangle().fill(Palette.vermilion).frame(width: 6, height: 6)
                Text(request.status == .working ? "雪かき中" : "募集中").font(.dot(.footnote)).foregroundStyle(Palette.vermilion)
                Spacer()
            }
            Text(request.area ?? "美唄市内").font(.dot(.title3))
            HStack {
                Text("参加 \(request.joinedCount)/\(request.capacity ?? 5)人").font(.dot(.footnote)).foregroundStyle(Palette.muted)
                Spacer()
                SnowAmountView(amount: request.amount).foregroundStyle(Palette.muted)
            }
            if let tools = request.tools, !tools.isEmpty {
                Text("道具: \(tools)").font(.dot(.footnote)).foregroundStyle(Palette.muted)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }

    private var confirm: some View {
        VStack(alignment: .leading, spacing: 12) {
            Rectangle().fill(Palette.navy).frame(height: 2)
            Text("この雪かきに参加しますか?").font(.dot(.headline))
            HStack(spacing: 12) {
                Button(action: onJoin) { Text(isJoining ? "参加しています…" : "参加する") }
                    .buttonStyle(.pixel)
                Button(action: onCancel) { Text("やめておく") }
                    .buttonStyle(.pixelSecondary)
            }
            .disabled(isJoining)
        }
        .padding(.top, 4)
        .transition(.opacity.combined(with: .move(edge: .top)))
    }
}
