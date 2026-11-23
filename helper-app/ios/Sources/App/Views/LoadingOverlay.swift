// 画面の真ん中に出すローディング(雪の結晶が回る+「読み込み中…」。SPEC「第 3 版の変更」1)。
// 出ている間は、うしろの画面のボタンを押せない(全面を覆って、押されたことを受け止める)。

import SwiftUI

struct LoadingOverlay: View {
    /// 1 回転にかける時間(秒)。
    private static let spinSeconds = 1.2
    @State private var isSpinning = false

    var body: some View {
        ZStack {
            // うしろを少し隠して、押されたことをここで受け止める
            Palette.white.opacity(0.7)
                .ignoresSafeArea()
                .contentShape(Rectangle())
                .onTapGesture {}
            VStack(spacing: 12) {
                PixelIcon(name: "snowflake", size: 48)
                    .rotationEffect(.degrees(isSpinning ? 360 : 0))
                    .animation(.linear(duration: Self.spinSeconds).repeatForever(autoreverses: false), value: isSpinning)
                Text("読み込み中…").font(.dot(.headline)).foregroundStyle(Palette.navy)
            }
            .padding(24)
            .background(Palette.white)
            .overlay(Rectangle().stroke(Palette.navy, lineWidth: 2))
            .background(Rectangle().fill(Palette.navy).offset(x: 4, y: 4))
        }
        .onAppear { isSpinning = true }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("読み込み中")
        .accessibilityIdentifier("loading")
    }
}

extension View {
    /// isShown の間、画面の真ん中にローディングを出して、ボタンを押せなくする。
    func loadingOverlay(_ isShown: Bool) -> some View {
        overlay {
            if isShown { LoadingOverlay().transition(.opacity) }
        }
    }
}
