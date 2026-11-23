// 見た目の決まり(SPEC の 5 色・四角めの角・ドット絵の雰囲気)と、よく使う部品。

import SwiftUI

enum Palette {
    /// 紺(文字・枠)
    static let navy = Color("Navy")
    /// 朱色(大事なボタン)
    static let vermilion = Color("Vermilion")
    /// 白
    static let white = Color("SnowWhite")
    /// 水色
    static let ice = Color("IceBlue")
    /// 金(演出)
    static let gold = Color("Gold")
}

/// ドット絵のアイコン(public/liff/icons/*.svg をアセットに入れたもの)。
struct PixelIcon: View {
    let name: String
    var size: CGFloat = 20

    var body: some View {
        Image("icon-\(name)")
            .resizable()
            .interpolation(.none)
            .frame(width: size, height: size)
            .accessibilityHidden(true)
    }
}

/// アイコンと文字を並べたもの。
struct IconLabel: View {
    let icon: String
    let text: String
    var size: CGFloat = 18

    var body: some View {
        HStack(spacing: 6) {
            PixelIcon(name: icon, size: size)
            Text(text)
        }
    }
}

/// 四角いボタン。primary は朱色(大事なボタン)、secondary は白地に紺の枠。
struct PixelButtonStyle: ButtonStyle {
    enum Kind {
        case primary
        case secondary
    }

    var kind: Kind = .primary
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(.body, design: .rounded).weight(.bold))
            .frame(maxWidth: .infinity, minHeight: 48)
            .padding(.horizontal, 12)
            .foregroundStyle(kind == .primary ? Palette.white : Palette.navy)
            .background(kind == .primary ? Palette.vermilion : Palette.white)
            .overlay(Rectangle().stroke(Palette.navy, lineWidth: 3))
            .offset(y: configuration.isPressed ? 2 : 0)
            .background(Rectangle().fill(Palette.navy).offset(y: 4))
            .opacity(isEnabled ? 1 : 0.45)
    }
}

extension ButtonStyle where Self == PixelButtonStyle {
    static var pixel: PixelButtonStyle { PixelButtonStyle(kind: .primary) }
    static var pixelSecondary: PixelButtonStyle { PixelButtonStyle(kind: .secondary) }
}

/// 白い四角の箱(紺の枠)。
struct PixelCard<Content: View>: View {
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 8) { content }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Palette.white)
            .overlay(Rectangle().stroke(Palette.navy, lineWidth: 3))
    }
}

/// 失敗したときの赤い文。空なら何も出さない。
struct ErrorText: View {
    let message: String?

    var body: some View {
        if let message, !message.isEmpty {
            IconLabel(icon: "warning", text: message)
                .font(.callout.weight(.semibold))
                .foregroundStyle(Palette.vermilion)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

/// 画面の見出し。
struct ScreenTitle: View {
    let icon: String
    let text: String

    var body: some View {
        HStack(spacing: 8) {
            PixelIcon(name: icon, size: 28)
            Text(text).font(.system(.title2, design: .rounded).weight(.heavy))
        }
        .foregroundStyle(Palette.navy)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// 雪の多さ(雪の結晶 1〜3 個)。
struct SnowAmountView: View {
    let amount: SnowAmount

    var body: some View {
        HStack(spacing: 2) {
            ForEach(0..<amount.flakes, id: \.self) { _ in PixelIcon(name: "snowflake", size: 16) }
            Text(amount.label).font(.footnote.weight(.bold))
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("雪の多さ \(amount.label)")
    }
}

/// 水色の背景で、上下にスクロールできる画面の枠。
struct ScreenScaffold<Content: View>: View {
    @ViewBuilder let content: Content

    var body: some View {
        ScrollView {
            VStack(spacing: 16) { content }
                .padding(16)
        }
        .background(Palette.ice.ignoresSafeArea())
        .foregroundStyle(Palette.navy)
    }
}

/// 経過時間を「12:34」や「1:02:03」の形にする。
func formatElapsed(_ seconds: TimeInterval) -> String {
    let total = max(0, Int(seconds))
    let h = total / 3600, m = (total % 3600) / 60, s = total % 60
    return h > 0 ? String(format: "%d:%02d:%02d", h, m, s) : String(format: "%02d:%02d", m, s)
}
