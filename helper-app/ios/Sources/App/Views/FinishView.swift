// 画面 7「お疲れ様」: 「CLEAR」と、獲得ポイントを派手に(数字が回ってから止まる・花火・ファンファーレ)。
// 内訳(雪かき・評価・再会・初回ボーナス)と、スコップの回数(自分・みんな)。

import HelperCore
import SwiftUI

struct FinishView: View {
    let requestId: String
    @EnvironmentObject private var app: AppModel
    @State private var points: RequestPoints?
    @State private var shown = 0
    @State private var error: String?
    @State private var coach = SoundCoach()

    /// 数字が回る時間(秒)と、回る回数。
    private static let rollSeconds = 1.6
    private static let rollSteps = 40

    var body: some View {
        ZStack {
            ScreenScaffold {
                Text("CLEAR")
                    .font(.system(size: 64, weight: .black, design: .monospaced))
                    .foregroundStyle(Palette.gold)
                    .shadow(color: Palette.navy, radius: 0, x: 4, y: 4)
                    .padding(.top, 24)
                Text("お疲れ様でした!").font(.title2.weight(.heavy))
                ErrorText(message: error)
                if let points {
                    PixelCard {
                        Text("獲得ポイント").font(.headline)
                        Text("+\(shown.formatted()) pt")
                            .font(.system(size: 52, weight: .heavy, design: .rounded))
                            .contentTransition(.numericText())
                            .frame(maxWidth: .infinity)
                    }
                    breakdown(points)
                } else if error == nil {
                    ProgressView("ポイントを数えています…")
                }
                Button { app.go(.ranking) } label: { IconLabel(icon: "crown", text: "ランキングへ") }
                    .buttonStyle(.pixel)
                Button { app.go(.requests) } label: { IconLabel(icon: "runner", text: "助けに行く") }
                    .buttonStyle(.pixelSecondary)
            }
            if points != nil { Fireworks().allowsHitTesting(false).ignoresSafeArea() }
        }
        .task { await load() }
    }

    private func breakdown(_ points: RequestPoints) -> some View {
        PixelCard {
            row("雪かき", points.workPoints)
            row(points.stars.map { "評価(星 \($0))" } ?? "評価(まだ)", points.ratingPoints)
            row(points.reunion.partners.isEmpty ? "再会" : "再会(\(points.reunion.partners.joined(separator: "、")) さん)", points.reunion.points)
            row("初回ボーナス", points.firstFinishBonus)
            Divider().overlay(Palette.navy)
            HStack {
                PixelIcon(name: "snowflake", size: 18)
                Text("スコップ: あなた \(points.scoops.mine)杯 ・ みんな \(points.scoops.total)杯")
            }
            .font(.subheadline.weight(.bold))
        }
    }

    private func row(_ title: String, _ value: Int) -> some View {
        HStack {
            Text(title)
            Spacer()
            Text("+\(value.formatted()) pt").font(.body.weight(.bold))
        }
    }

    private func load() async {
        do {
            let loaded = try await app.api.points(id: requestId, userId: app.userId)
            points = loaded
            coach.fanfare()
            await roll(to: loaded.total)
        } catch {
            self.error = "ポイントを読めませんでした: \(error.localizedDescription)"
        }
    }

    /// 数字を回してから、本当の値で止める。
    private func roll(to total: Int) async {
        let pause = UInt64(Self.rollSeconds / Double(Self.rollSteps) * 1_000_000_000)
        for step in 1...Self.rollSteps {
            let progress = Double(step) / Double(Self.rollSteps)
            let jitter = step < Self.rollSteps ? Int.random(in: 0...max(1, total / 10)) : 0
            withAnimation(.linear(duration: 0.03)) { shown = min(total, Int(Double(total) * progress) + jitter) }
            try? await Task.sleep(nanoseconds: pause)
        }
        withAnimation { shown = total }
    }
}

/// ドット絵ふうの花火(四角い火花が広がって消える)。
private struct Fireworks: View {
    private struct Burst {
        let center: CGPoint
        let delay: Double
        let color: Color
    }

    private static let bursts: [Burst] = [
        Burst(center: CGPoint(x: 0.25, y: 0.22), delay: 0, color: Palette.gold),
        Burst(center: CGPoint(x: 0.72, y: 0.18), delay: 0.5, color: Palette.vermilion),
        Burst(center: CGPoint(x: 0.5, y: 0.35), delay: 1.0, color: Palette.gold),
        Burst(center: CGPoint(x: 0.18, y: 0.45), delay: 1.5, color: Palette.ice),
        Burst(center: CGPoint(x: 0.8, y: 0.42), delay: 2.0, color: Palette.gold),
    ]
    private static let sparks = 14
    private static let burstSeconds = 1.4
    private static let cycleSeconds = 3.0
    @State private var start = Date()

    var body: some View {
        TimelineView(.animation) { timeline in
            Canvas { context, size in
                let elapsed = timeline.date.timeIntervalSince(start).truncatingRemainder(dividingBy: Self.cycleSeconds)
                for burst in Self.bursts {
                    let t = (elapsed - burst.delay) / Self.burstSeconds
                    guard t > 0, t < 1 else { continue }
                    let origin = CGPoint(x: burst.center.x * size.width, y: burst.center.y * size.height)
                    let radius = 110 * t
                    for i in 0..<Self.sparks {
                        let angle = Double(i) / Double(Self.sparks) * 2 * .pi
                        let x = origin.x + cos(angle) * radius
                        let y = origin.y + sin(angle) * radius + 40 * t * t
                        let side = 7.0 * (1 - t) + 2
                        context.opacity = 1 - t
                        context.fill(Path(CGRect(x: x, y: y, width: side, height: side)), with: .color(burst.color))
                    }
                }
            }
        }
    }
}
