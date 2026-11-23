// 画面 7「お疲れ様」: 「CLEAR」と、チームでの消費カロリー(大きく・数字が回ってから止まる・花火・ファンファーレ)。
// その下に、あなたの消費カロリーと、一緒にやった人の名前とそれぞれの kcal(SPEC「第 3 版の変更」4)。ポイントは出さない。
// - チームの kcal は GET /api/teams/mine/{userId} の、その依頼の teamCalories
// - 一緒にやった人の kcal は、依頼の詳細の helpers[].calories(なければ時間から出した値。サーバーと同じ)
// - 終わってすぐで、まだ全員の kcal が届いていなければ、数秒あけて読み直す
// - 演出は 1 回だけ(もう一度見るボタンはない。SPEC「第 3 版の変更」2)

import SwiftUI

/// お疲れ様の画面に出す数字。
private struct FinishSummary: Equatable {
    struct Partner: Equatable, Identifiable {
        let id: String
        let name: String
        let kcal: Double
    }

    let teamKcal: Double
    let myKcal: Double
    let partners: [Partner]
    /// チームの記録に入っていて、全員の kcal が届いているか(届いていなければ読み直す)。
    let isComplete: Bool
}

struct FinishView: View {
    let requestId: String
    @EnvironmentObject private var app: AppModel
    @State private var summary: FinishSummary?
    @State private var shownKcal = 0
    @State private var isTrying = true
    @State private var error: String?
    @State private var isShowingFireworks = false
    /// ファンファーレの部品。画面を作り直すたびに音の部品を作らないよう、鳴らすときに 1 回だけ作る。
    @State private var coach: SoundCoach?

    /// 数字が回る時間(秒)と、回る回数。
    private static let rollSeconds = 1.6
    private static let rollSteps = 40
    /// 全員の kcal がそろうまで読み直す回数と間隔(秒)。
    private static let maxAttempts = 4
    private static let retrySeconds: UInt64 = 3

    var body: some View {
        ZStack {
            ScreenScaffold {
                Text("CLEAR")
                    .font(.dot(size: 64))
                    .foregroundStyle(Palette.gold)
                    .shadow(color: Palette.navy, radius: 0, x: 4, y: 4)
                    .padding(.top, 24)
                Text("お疲れ様でした!").font(.dot(.title2))
                ErrorText(message: summary == nil ? error : nil)
                if let summary {
                    teamCard
                    membersCard(summary)
                }
                Button { app.go(.teams) } label: { IconLabel(icon: "cheer", text: "チームの記録へ") }
                    .buttonStyle(.pixel)
                Button { app.go(.requests) } label: { IconLabel(icon: "runner", text: "助けに行く") }
                    .buttonStyle(.pixelSecondary)
            }
            if isShowingFireworks {
                Fireworks { isShowingFireworks = false }.allowsHitTesting(false).ignoresSafeArea()
            }
        }
        .loadingOverlay(summary == nil && isTrying)
        .task { await load() }
    }

    private var teamCard: some View {
        PixelCard {
            Text("チームでの消費カロリー").font(.dot(.headline))
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(shownKcal.formatted())
                    .font(.dot(size: 64, relativeTo: .largeTitle))
                    .foregroundStyle(Palette.vermilion)
                    .contentTransition(.numericText())
                    .monospacedDigit()
                Text("kcal").font(.dot(.title2))
            }
            .frame(maxWidth: .infinity)
        }
    }

    private func membersCard(_ summary: FinishSummary) -> some View {
        PixelCard {
            row(name: "あなた", kcal: summary.myKcal, isMe: true)
            if !summary.partners.isEmpty {
                Divider().overlay(Palette.navy)
                Text("一緒にやった人").font(.dot(.subheadline)).foregroundStyle(Palette.muted)
                ForEach(summary.partners) { partner in row(name: "\(partner.name) さん", kcal: partner.kcal, isMe: false) }
            }
        }
    }

    private func row(name: String, kcal: Double, isMe: Bool) -> some View {
        HStack {
            Text(name).font(.dot(isMe ? .title3 : .body))
            Spacer()
            Text("約\(formatKcal(kcal))kcal")
                .font(.dot(isMe ? .title3 : .body))
                .foregroundStyle(isMe ? Palette.vermilion : Palette.navy)
        }
    }

    // MARK: - 読み込み

    private func load() async {
        defer { isTrying = false }
        for attempt in 1...Self.maxAttempts {
            if attempt > 1 {
                try? await Task.sleep(nanoseconds: Self.retrySeconds * 1_000_000_000)
                if Task.isCancelled { return }
            }
            guard let loaded = await fetchSummary() else { continue }
            let isFirst = summary == nil
            summary = loaded
            if isFirst {
                celebrate()
                await roll(to: Int(loaded.teamKcal.rounded()))
            } else {
                withAnimation { shownKcal = Int(loaded.teamKcal.rounded()) }
            }
            if loaded.isComplete { return }
        }
    }

    /// チームの記録と依頼の詳細を同時に読んで、画面の数字にする。読めなければ nil(error に理由)。
    private func fetchSummary() async -> FinishSummary? {
        async let teamsResult = app.api.myTeams(userId: app.userId)
        async let requestResult = app.loadRequest(requestId)
        let team = (try? await teamsResult)?.teams.first { $0.id == requestId }
        switch await requestResult {
        case .failure(let failure):
            error = "読み込めませんでした: \(failure.message)"
            return nil
        case .success(let request):
            error = nil
            let me = request.helper(app.userId)
            let partners = request.allHelpers
                .filter { $0.userId != app.userId }
                .map { FinishSummary.Partner(id: $0.userId, name: $0.displayName, kcal: request.calories(of: $0)) }
            let memberTotal = request.allHelpers.reduce(0) { $0 + request.calories(of: $1) }
            return FinishSummary(
                teamKcal: team?.teamCalories ?? memberTotal,
                myKcal: team?.myCalories ?? me.map { request.calories(of: $0) } ?? UserStore.calories(requestId: requestId),
                partners: partners,
                isComplete: team != nil && request.allHelpers.allSatisfy { $0.calories != nil }
            )
        }
    }

    // MARK: - 演出(1 回だけ)

    private func celebrate() {
        let fanfare = coach ?? SoundCoach()
        coach = fanfare
        fanfare.fanfare()
        isShowingFireworks = true
    }

    /// 数字を回してから、本当の値で止める。
    private func roll(to total: Int) async {
        let pause = UInt64(Self.rollSeconds / Double(Self.rollSteps) * 1_000_000_000)
        for step in 1...Self.rollSteps {
            if Task.isCancelled { break }
            let progress = Double(step) / Double(Self.rollSteps)
            let jitter = step < Self.rollSteps ? Int.random(in: 0...max(1, total / 10)) : 0
            withAnimation(.linear(duration: 0.03)) { shownKcal = min(total, Int(Double(total) * progress) + jitter) }
            try? await Task.sleep(nanoseconds: pause)
        }
        withAnimation { shownKcal = total }
    }
}

/// ドット絵ふうの花火(四角い火花が広がって消える)。1 回だけ打ち上げたら onEnd を呼ぶ(描き続けない)。
private struct Fireworks: View {
    let onEnd: () -> Void

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
    /// 全部の花火が消えるまでの時間(秒)。
    private static let totalSeconds = 2.0 + burstSeconds
    /// 1 秒に描く回数(画面の最大より少なくして軽くする)。
    private static let framesPerSecond = 30.0
    @State private var start = Date()

    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / Self.framesPerSecond)) { timeline in
            Canvas { context, size in
                let elapsed = timeline.date.timeIntervalSince(start)
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
        .task {
            try? await Task.sleep(nanoseconds: UInt64(Self.totalSeconds * 1_000_000_000))
            if !Task.isCancelled { onEnd() }
        }
    }
}
