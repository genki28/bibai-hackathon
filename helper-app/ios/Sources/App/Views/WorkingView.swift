// 画面 5「雪かき中」: 経過時間・リーダー・みんなで動かした雪。スコップ計はいつもオン(画面を閉じても数える。HelperSession)。
// [雪かきを終える]: リーダー(か、リーダーがいない)なら範囲を記録する画面へ。ほかの人は「〇〇さんが範囲を記録中…」で待つ。

import HelperCore
import SwiftUI

struct WorkingView: View {
    let requestId: String
    @EnvironmentObject private var app: AppModel
    @EnvironmentObject private var session: HelperSession
    @State private var request: HelpRequest?
    @State private var error: String?
    @State private var isWaitingLeader = false

    var body: some View {
        ScreenScaffold {
            ScreenTitle(icon: "snowman", text: isWaitingLeader ? "もうすぐ終わり" : "雪かき中")
            ErrorText(message: error)
            if let request {
                if isWaitingLeader {
                    leaderWait(request)
                } else {
                    working(request)
                }
            } else {
                ProgressView("読み込んでいます…")
            }
        }
        .task {
            await app.pollRequest(requestId, onUpdate: { latest in
                if request == nil { session.beginScooping(latest) }
                request = latest
                error = nil
                session.updateHelpers(latest)
                if latest.status == .working { return false }
                Task {
                    await session.flushScoops()
                    app.go(AppModel.screen(for: latest, userId: app.userId))
                }
                return true
            }, onError: { error = $0 })
        }
    }

    @ViewBuilder
    private func working(_ request: HelpRequest) -> some View {
        CrewScene(helpers: request.allHelpers, myUserId: app.userId, myScoops: session.myScoops)
        PixelCard {
            TimelineView(.periodic(from: .now, by: 1)) { context in
                let startedAt = ServerDate.parse(request.startedAt) ?? context.date
                HStack {
                    PixelIcon(name: "hourglass", size: 24)
                    Text(formatElapsed(context.date.timeIntervalSince(startedAt)))
                        .font(.system(size: 36, weight: .heavy, design: .monospaced))
                }
            }
            if request.leaderUserId != nil {
                IconLabel(
                    icon: "crown",
                    text: request.leaderUserId == app.userId ? "あなたがリーダー(終わったら範囲を記録)" : "リーダー: \(request.leaderName) さん"
                )
                .font(.subheadline.weight(.bold))
            }
            Text("いっしょに: \(request.allHelpers.map(\.displayName).joined(separator: "、"))").font(.footnote)
        }
        movedSnow
        Button { session.setSoundOn(!session.isSoundOn) } label: {
            IconLabel(icon: session.isSoundOn ? "speaker" : "mute", text: session.isSoundOn ? "音の実況: オン" : "音の実況: オフ")
        }
        .buttonStyle(.pixelSecondary)
        Button { session.simulateScoop() } label: { IconLabel(icon: "test", text: "揺れをまねる") }
            .buttonStyle(.pixelSecondary)
        Button { Task { await finish(request) } } label: { IconLabel(icon: "check", text: "雪かきを終える") }
            .buttonStyle(.pixel)
    }

    private var movedSnow: some View {
        let kg = scoopKg(session.teamCount)
        return PixelCard {
            Text("みんなで動かした雪").font(.headline)
            Text("約\(kg)kg(\(session.teamCount)杯)")
                .font(.system(size: 32, weight: .heavy, design: .rounded))
            if let comparison = comparisonFor(kg: kg) {
                IconLabel(icon: "party", text: "\(comparison.label)!").font(.headline).padding(6).background(Palette.gold)
            }
            Text("あなた: \(session.myScoops)杯(約\(scoopKg(session.myScoops))kg)").font(.subheadline)
            if !session.isMotionAvailable {
                Text("この端末ではスコップ計が使えません(経過時間で記録します)").font(.footnote)
            } else {
                Text("スコップ計はオン。画面を閉じても数えます").font(.footnote)
            }
        }
    }

    private func leaderWait(_ request: HelpRequest) -> some View {
        PixelCard {
            HStack {
                ProgressView()
                Text("\(request.leaderName) さんが範囲を記録中…").font(.headline)
            }
            Text("終わったら、自動でお疲れ様の画面に進みます").font(.footnote)
        }
    }

    private func finish(_ request: HelpRequest) async {
        // 終える前に、いまの回数を送っておく(送れなくても進む)
        await session.flushScoops()
        if request.canFinish(app.userId) {
            app.go(.area(requestId))
        } else {
            isWaitingLeader = true
        }
    }
}

/// 雪かきのドット絵(背景と、参加者の人数ぶんの主人公)。すくうたびに自分が雪を投げる(4 コマ)。
private struct CrewScene: View {
    let helpers: [Helper]
    let myUserId: String
    let myScoops: Int
    @State private var frame = 0

    private static let frameCount = 4
    private static let maxShown = 5

    var body: some View {
        HStack(alignment: .bottom, spacing: 0) {
                ForEach(Array(helpers.prefix(Self.maxShown))) { helper in
                    VStack(spacing: 0) {
                        Text(helper.userId == myUserId ? "あなた" : helper.displayName)
                            .font(.caption2.weight(.bold)).lineLimit(1)
                            .padding(.horizontal, 3).background(Palette.white.opacity(0.85))
                        sprite(frame: helper.userId == myUserId ? frame : 0)
                    }
                }
        }
        .padding(.bottom, 6)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
        .frame(height: 180)
        .background { Image("working-bg").resizable().interpolation(.none).scaledToFill() }
        .clipped()
        .overlay(Rectangle().stroke(Palette.navy, lineWidth: 3))
        .onChange(of: myScoops) { _, _ in Task { await throwOnce() } }
        .accessibilityLabel("雪かきの様子")
    }

    private func sprite(frame: Int) -> some View {
        let size = CGSize(width: 271.0 / 3.2, height: 247.0 / 3.2)
        return Image("working-hero")
            .resizable()
            .interpolation(.none)
            .frame(width: size.width * CGFloat(Self.frameCount), height: size.height)
            .offset(x: -size.width * CGFloat(frame) + size.width * CGFloat(Self.frameCount - 1) / 2)
            .frame(width: size.width, height: size.height)
            .clipped()
    }

    @MainActor
    private func throwOnce() async {
        for next in 1..<Self.frameCount {
            frame = next
            try? await Task.sleep(nanoseconds: 120_000_000)
        }
        frame = 0
    }
}
