// 画面 4「集合」: 参加者の名前と「〇/〇人集合」。3 秒ごとに読み直す。
// [雪かきを始める] で開始(到着した人ならだれでも)。状態が working になったら雪かき中の画面へ。

import HelperCore
import SwiftUI

struct GatherView: View {
    let requestId: String
    @EnvironmentObject private var app: AppModel
    @EnvironmentObject private var session: HelperSession
    @State private var request: HelpRequest?
    @State private var error: String?
    @State private var isStarting = false

    var body: some View {
        ScreenScaffold {
            ScreenTitle(icon: "cheer", text: "集合")
            ErrorText(message: error)
            if let request {
                let arrived = request.allHelpers.filter { $0.arrivedAt != nil }.count
                PixelCard {
                    Text("\(arrived)/\(request.allHelpers.count)人集合")
                        .font(.system(size: 40, weight: .heavy, design: .rounded))
                        .frame(maxWidth: .infinity)
                }
                PixelCard {
                    ForEach(request.allHelpers) { helper in
                        HStack {
                            PixelIcon(name: helper.arrivedAt != nil ? "check" : "hourglass", size: 20)
                            Text(helper.userId == app.userId ? "\(helper.displayName)(あなた)" : helper.displayName)
                                .font(.headline)
                            Spacer()
                            Text(helper.arrivedAt != nil ? "到着" : "向かっています").font(.footnote)
                        }
                    }
                }
                Text("みんながそろったら始めよう").font(.subheadline)
                Button { Task { await start() } } label: { IconLabel(icon: "snowman", text: "雪かきを始める") }
                    .buttonStyle(.pixel)
                    .disabled(isStarting)
            } else {
                ProgressView("読み込んでいます…")
            }
        }
        .task {
            await app.pollRequest(requestId, onUpdate: { latest in
                if request == nil { session.beginTrip(latest) }
                request = latest
                error = nil
                guard latest.status != .accepted && latest.status != .waiting else { return false }
                app.go(AppModel.screen(for: latest, userId: app.userId))
                return true
            }, onError: { error = $0 })
        }
    }

    private func start() async {
        isStarting = true
        defer { isStarting = false }
        do {
            let started = try await app.api.start(id: requestId, userId: app.userId)
            app.go(AppModel.screen(for: started, userId: app.userId))
        } catch {
            self.error = "始められませんでした: \(error.localizedDescription)"
        }
    }
}
