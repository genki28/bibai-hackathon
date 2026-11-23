// 画面 3「目的地」: 地図に家のピン「ここ」と自分「あなた」。住所・募集者の名前・雪の多さ・道具。
// 位置の共有はいつもオン(画面を閉じても送り続ける。HelperSession)。

import HelperCore
import MapKit
import SwiftUI

struct PlaceView: View {
    let requestId: String
    @EnvironmentObject private var app: AppModel
    @EnvironmentObject private var session: HelperSession
    @State private var request: HelpRequest?
    @State private var error: String?
    @State private var camera: MapCameraPosition = .automatic
    @State private var isConfirmingLeave = false
    @State private var isBusy = false

    var body: some View {
        ScreenScaffold {
            ScreenTitle(icon: "pin", text: "目的地")
            ErrorText(message: error)
            if let request {
                map(for: request)
                details(for: request)
                if !session.locationStatus.isEmpty {
                    IconLabel(icon: "antenna", text: session.locationStatus).font(.footnote)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                Button { app.go(.arrival(requestId)) } label: { IconLabel(icon: "house", text: "到着しました") }
                    .buttonStyle(.pixel)
                Button { Task { await session.demoStep() } } label: { IconLabel(icon: "test", text: "デモ: 家に近づく") }
                    .buttonStyle(.pixelSecondary)
                Button { isConfirmingLeave = true } label: { Text("参加をやめる") }
                    .buttonStyle(.pixelSecondary)
                    .disabled(isBusy)
            } else {
                ProgressView("読み込んでいます…")
            }
        }
        .task { await load() }
        .confirmationDialog("参加をやめますか?", isPresented: $isConfirmingLeave, titleVisibility: .visible) {
            Button("参加をやめる", role: .destructive) { Task { await leave() } }
            Button("続ける", role: .cancel) {}
        }
    }

    private func map(for request: HelpRequest) -> some View {
        Map(position: $camera) {
            Annotation("ここ", coordinate: request.home.coordinate) {
                PixelIcon(name: "house", size: 36)
            }
            if let me = session.myPoint {
                Annotation("あなた", coordinate: me.coordinate) {
                    PixelIcon(name: "runner", size: 32)
                }
            }
        }
        .frame(height: 280)
        .overlay(Rectangle().stroke(Palette.navy, lineWidth: 3))
    }

    private func details(for request: HelpRequest) -> some View {
        PixelCard {
            if let address = request.address { IconLabel(icon: "house", text: address).font(.headline) }
            if let name = request.name { Text("募集した人: \(name) さん") }
            SnowAmountView(amount: request.amount)
            if let depth = request.depth, !depth.isEmpty { Text("雪の深さ: \(depth)") }
            Text("道具: \(request.tools.flatMap { $0.isEmpty ? nil : $0 } ?? "とくになし")")
            Text("参加 \(request.joinedCount)/\(request.capacity ?? 5)人").font(.footnote)
        }
    }

    private func load() async {
        switch await app.loadRequest(requestId) {
        case .success(let loaded):
            if loaded.status == .done || loaded.status == .cancelled || loaded.hasArrived(app.userId) {
                app.go(AppModel.screen(for: loaded, userId: app.userId))
                return
            }
            request = loaded
            camera = .region(MKCoordinateRegion(center: loaded.home.coordinate, latitudinalMeters: 2600, longitudinalMeters: 2600))
            session.beginTrip(loaded)
        case .failure(let failure):
            error = "読み込めませんでした: \(failure.message)"
        }
    }

    private func leave() async {
        isBusy = true
        defer { isBusy = false }
        do {
            _ = try await app.api.leave(id: requestId, userId: app.userId)
            app.go(.requests)
        } catch {
            self.error = "参加をやめられませんでした: \(error.localizedDescription)"
        }
    }
}
