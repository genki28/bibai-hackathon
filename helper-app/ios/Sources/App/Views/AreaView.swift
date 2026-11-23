// 画面 6「範囲を記録」: 地図の上を指でなぞって筆で塗る(細い 1.5m / 太い 4m)。面積は HelperCore の paintedAreaM2。
// - [地図を動かす] / [筆で塗る] の切り替え、[1 つ戻す] [やり直す]。5,000 ㎡ まで
// - 塗った線は緯度経度で覚えて、地図を動かす・拡大するたびに描き直す(地図と一緒に動く。BrushOverlay)
// - [雪かきを完了する] で終了の API に面積を送り、お疲れ様の画面へ

import HelperCore
import MapKit
import SwiftUI

/// 緯度経度で覚えた、筆の線 1 本。
struct GeoStroke: Equatable {
    let widthM: Double
    let points: [GeoPoint]
}

/// 地図の動きと、なぞっている途中の線(1 秒に何十回も変わる)。
/// @Observable にして、読んでいる BrushOverlay だけを描き直す(画面全体・地図を作り直さない)。
@Observable
final class BrushDraft {
    /// 地図が動いた回数(変わるたびに線を描き直す)。
    var cameraTick = 0
    /// なぞっている途中の線。
    var current: GeoStroke?
    /// 最後に点を足した画面の位置(近すぎる点は足さない)。
    @ObservationIgnored var lastLocation: CGPoint?
}

struct AreaView: View {
    let requestId: String
    @EnvironmentObject private var app: AppModel
    @State private var request: HelpRequest?
    @State private var camera: MapCameraPosition = .automatic
    @State private var strokes: [GeoStroke] = []
    @State private var draft = BrushDraft()
    @State private var widthM = BrushArea.thinWidthM
    @State private var isBrush = true
    @State private var areaM2 = 0
    @State private var error: String?
    @State private var isSending = false

    /// 地図を最初に出すときの広さ(m)。
    private static let initialSpanM = 120.0
    /// なぞるとき、前の点からこれ(画面のポイント)より近い点は足さない(点が増えすぎて重くならないように)。
    private static let minPointGap: CGFloat = 3

    private var isTooLarge: Bool { areaM2 > BrushArea.maxAreaM2 }

    var body: some View {
        VStack(spacing: 10) {
            BrandLine()
            ScreenTitle(text: "範囲を記録")
            Text(isBrush ? "雪かきしたところを指でなぞって塗ってね" : "雪かきした場所まで地図を動かしてね")
                .font(.dot(.subheadline)).frame(maxWidth: .infinity, alignment: .leading)
            if let request { mapArea(home: request.home) } else { Spacer() }
            controls
            ErrorText(message: isTooLarge ? "広すぎます(5,000 ㎡まで)。[1 つ戻す] で減らしてください。" : error)
            HStack {
                Text("塗った広さ").font(.dot(.headline))
                Spacer()
                Text("\(areaM2.formatted()) ㎡").font(.dot(.title2))
                Text("/ 5,000 ㎡ まで").font(.dot(.caption))
            }
            Button { Task { await finish() } } label: { IconLabel(icon: "check", text: "雪かきを完了する") }
                .buttonStyle(.pixel)
                .disabled(strokes.isEmpty || isTooLarge || isSending)
        }
        .padding(.horizontal, 24)
        .padding(.bottom, 16)
        .background(Palette.white.ignoresSafeArea())
        .foregroundStyle(Palette.navy)
        .font(.dot(.body))
        .loadingOverlay(request == nil && error == nil)
        .task { await load() }
    }

    private func mapArea(home: GeoPoint) -> some View {
        MapReader { proxy in
            Map(position: $camera, interactionModes: isBrush ? [] : .all) {
                Annotation("ここ", coordinate: home.coordinate) { PixelIcon(name: "house", size: 28) }
            }
            .onMapCameraChange(frequency: .continuous) { draft.cameraTick &+= 1 }
            .overlay {
                BrushOverlay(strokes: strokes, draft: draft, proxy: proxy, home: home)
                    .opacity(0.55)
                    .allowsHitTesting(false)
            }
            .overlay {
                if isBrush {
                    Color.clear
                        .contentShape(Rectangle())
                        .gesture(drawGesture(proxy: proxy, home: home))
                }
            }
            .overlay(alignment: .topLeading) {
                IconLabel(icon: isBrush ? "pencil" : "hand", text: isBrush ? "筆で塗っています" : "地図を動かす")
                    .font(.dot(.caption)).padding(6).background(Palette.white).padding(8)
            }
        }
        .frame(maxHeight: .infinity)
        .overlay(Rectangle().stroke(Palette.navy, lineWidth: 3))
    }

    private var controls: some View {
        VStack(spacing: 8) {
            HStack(spacing: 8) {
                toggle("地図を動かす", isOn: !isBrush) { isBrush = false }
                toggle("筆で塗る", isOn: isBrush) { isBrush = true }
            }
            HStack(spacing: 8) {
                toggle("細い 1.5m", isOn: widthM == BrushArea.thinWidthM) { choose(BrushArea.thinWidthM) }
                toggle("太い 4m", isOn: widthM == BrushArea.thickWidthM) { choose(BrushArea.thickWidthM) }
            }
            HStack(spacing: 8) {
                Button("1 つ戻す") { update(Array(strokes.dropLast())) }.buttonStyle(.pixelSecondary)
                Button("やり直す") { update([]) }.buttonStyle(.pixelSecondary)
            }
            .disabled(strokes.isEmpty)
        }
    }

    private func toggle(_ title: String, isOn: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) { Text(title) }
            .buttonStyle(PixelButtonStyle(kind: isOn ? .primary : .secondary))
            .accessibilityAddTraits(isOn ? .isSelected : [])
    }

    /// 太さを選んだら、そのまま塗れるようにする。
    private func choose(_ width: Double) {
        widthM = width
        isBrush = true
    }

    private func drawGesture(proxy: MapProxy, home: GeoPoint) -> some Gesture {
        DragGesture(minimumDistance: 0, coordinateSpace: .local)
            .onChanged { value in
                if let last = draft.lastLocation,
                   hypot(value.location.x - last.x, value.location.y - last.y) < Self.minPointGap { return }
                guard let coordinate = proxy.convert(value.location, from: .local) else { return }
                draft.lastLocation = value.location
                let point = GeoPoint(coordinate)
                draft.current = GeoStroke(widthM: widthM, points: (draft.current?.points ?? []) + [point])
            }
            .onEnded { _ in
                draft.lastLocation = nil
                guard let finished = draft.current else { return }
                draft.current = nil
                update(strokes + [finished])
            }
    }

    private func update(_ next: [GeoStroke]) {
        strokes = next
        guard let home = request?.home else { return }
        let local = next.map { stroke in
            BrushStroke(widthM: stroke.widthM, points: stroke.points.map { toLocalMeters($0, origin: home) })
        }
        areaM2 = Int(paintedAreaM2(local).rounded())
    }

    private func load() async {
        switch await app.loadRequest(requestId) {
        case .success(let loaded):
            if loaded.status != .working || !loaded.canFinish(app.userId) {
                app.go(loaded.status == .working ? .working(requestId) : AppModel.screen(for: loaded, userId: app.userId))
                return
            }
            request = loaded
            camera = .region(MKCoordinateRegion(
                center: loaded.home.coordinate,
                latitudinalMeters: Self.initialSpanM,
                longitudinalMeters: Self.initialSpanM
            ))
        case .failure(let failure):
            error = "読み込めませんでした: \(failure.message)"
        }
    }

    private func finish() async {
        isSending = true
        defer { isSending = false }
        do {
            try await app.whileBusy {
                _ = try await app.api.finish(id: requestId, userId: app.userId, areaM2: areaM2)
                app.go(.finish(requestId))
            }
        } catch {
            self.error = "終了できませんでした: \(error.localizedDescription)"
        }
    }
}

/// 塗った線を、地図の上に描く(緯度経度 → 画面の点に直す)。地図が動く・なぞるたびに、ここだけ描き直す。
private struct BrushOverlay: View {
    let strokes: [GeoStroke]
    let draft: BrushDraft
    let proxy: MapProxy
    let home: GeoPoint

    /// 1m が画面の何ポイントか(家から東へ 10m の点との距離で測る)。
    private func pointsPerMeter() -> CGFloat {
        let metersPerDegreeLng = 111_320 * cos(home.lat * .pi / 180)
        let east = CLLocationCoordinate2D(latitude: home.lat, longitude: home.lng + 10 / metersPerDegreeLng)
        guard let a = proxy.convert(home.coordinate, to: .local), let b = proxy.convert(east, to: .local) else { return 0 }
        return hypot(b.x - a.x, b.y - a.y) / 10
    }

    var body: some View {
        // ここで読むので、地図が動く・線が伸びるたびに、この Canvas だけが描き直される
        let all = strokes + (draft.current.map { [$0] } ?? [])
        let tick = draft.cameraTick
        return Canvas { context, _ in
            _ = tick
            let scale = pointsPerMeter()
            guard scale > 0 else { return }
            for stroke in all {
                let points = stroke.points.compactMap { proxy.convert($0.coordinate, to: .local) }
                let width = stroke.widthM * scale
                if points.count == 1, let p = points.first {
                    let dot = CGRect(x: p.x - width / 2, y: p.y - width / 2, width: width, height: width)
                    context.fill(Path(ellipseIn: dot), with: .color(Palette.vermilion))
                    continue
                }
                var path = Path()
                path.addLines(points)
                context.stroke(path, with: .color(Palette.vermilion), style: StrokeStyle(lineWidth: width, lineCap: .round, lineJoin: .round))
            }
        }
    }
}
