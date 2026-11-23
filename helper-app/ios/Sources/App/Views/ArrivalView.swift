// 画面 3'「到着(音の合言葉)」: 自分の合言葉(4 桁)を、高い音で 3 分くり返し鳴らす。
// お年寄りのスマホが聞き取ると到着になる。3 秒ごとに詳細を読み、自分の arrivedAt が入ったら集合の画面へ。

import HelperCore
import SwiftUI

struct ArrivalView: View {
    let requestId: String
    @EnvironmentObject private var app: AppModel
    @EnvironmentObject private var session: HelperSession
    @State private var player = SoundCodePlayer()
    @State private var code: String?
    @State private var isAudible = false
    @State private var isPlaying = false
    @State private var error: String?
    @State private var isBusy = false

    private var band: SoundBand { isAudible ? .low : .high }

    var body: some View {
        ScreenScaffold {
            ScreenTitle(icon: "antenna", text: "到着")
            PixelCard {
                Text("お年寄りのスマホに近づけてね").font(.title3.weight(.heavy))
                Text("雪かきするエリアを確認してください")
            }
            ErrorText(message: error)
            PixelCard {
                HStack {
                    PixelIcon(name: isPlaying ? "speaker" : "mute", size: 40)
                    VStack(alignment: .leading) {
                        Text(isPlaying ? "合言葉を鳴らしています" : "鳴らし終わりました").font(.headline)
                        Text(isAudible ? "聞こえる音" : "高い音(人には聞こえにくい音)").font(.footnote)
                    }
                }
                if let code {
                    Text("合言葉 \(code)").font(.system(.title, design: .monospaced).weight(.heavy))
                }
            }
            if !isPlaying, code != nil {
                Button { startPlaying() } label: { IconLabel(icon: "antenna", text: "もう一度鳴らす") }
                    .buttonStyle(.pixel)
            }
            Button {
                isAudible.toggle()
                if isPlaying { startPlaying() }
            } label: { Text(isAudible ? "高い音にする" : "聞こえる音にする") }
                .buttonStyle(.pixelSecondary)
            Button { Task { await skip() } } label: { Text("スキップして到着") }
                .buttonStyle(.pixelSecondary)
                .disabled(isBusy)
            Button { app.go(.place(requestId)) } label: { Text("目的地に戻る") }
                .buttonStyle(.pixelSecondary)
        }
        .task { await prepare() }
        .task {
            await app.pollRequest(requestId, onUpdate: { request in
                guard request.hasArrived(app.userId) || request.status != .accepted else { return false }
                moveOn(request)
                return true
            }, onError: { error = $0 })
        }
        .onDisappear { player.stop() }
    }

    private func prepare() async {
        if case .success(let request) = await app.loadRequest(requestId) { session.beginTrip(request) }
        do {
            code = try await app.api.arrivalCode(id: requestId, userId: app.userId)
            startPlaying()
        } catch {
            self.error = "合言葉を受け取れませんでした: \(error.localizedDescription)"
        }
    }

    private func startPlaying() {
        guard let code else { return }
        player.play(code: code, band: band) { isPlaying = false }
        isPlaying = true
    }

    private func skip() async {
        isBusy = true
        defer { isBusy = false }
        do {
            let request = try await app.api.arrive(id: requestId, userId: app.userId)
            moveOn(request)
        } catch {
            self.error = "到着にできませんでした: \(error.localizedDescription)"
        }
    }

    private func moveOn(_ request: HelpRequest) {
        player.stop()
        session.markArrived()
        app.go(request.status == .working ? .working(requestId) : AppModel.screen(for: request, userId: app.userId))
    }
}
