// 見た目の決まり。Web(public/liff/snow-ui.css・snow-pixel.css・template.css)に合わせる(SPEC「第 2 版の変更」2)。
// 白い背景・紺の文字・朱色の大事なボタン・四角い枠に影をずらした「ドット絵のカード」。文字はすべて DotGothic16。

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
    /// うすい灰色の文字(Web の --muted)
    static let muted = Color(red: 0x60 / 255, green: 0x6c / 255, blue: 0x7b / 255)
    /// うすい背景(Web の --wash。白いボタン)
    static let wash = Color(red: 0xf3 / 255, green: 0xf5 / 255, blue: 0xf7 / 255)
    /// テスト用のボタンの灰色(template.css の .test-tool)
    static let testGray = Color(red: 0x8a / 255, green: 0x94 / 255, blue: 0xa0 / 255)
}

// MARK: - 文字(DotGothic16)

extension Font {
    /// アプリに入れた書体の名前(Resources/Fonts/DotGothic16-Regular.ttf。SIL Open Font License)。
    static let dotFontName = "DotGothic16-Regular"

    /// DotGothic16 で、決まった大きさ(文字の大きさの設定に合わせて伸び縮みする)。
    /// この書体は太さが 1 つだけなので、太字にはしない(ドットの形がつぶれるため)。
    static func dot(size: CGFloat, relativeTo style: TextStyle = .body) -> Font {
        .custom(dotFontName, size: size, relativeTo: style)
    }

    /// DotGothic16 で、ふつうの文字の種類(見出し・本文・注など)。
    static func dot(_ style: TextStyle) -> Font {
        dot(size: dotSize(style), relativeTo: style)
    }

    private static func dotSize(_ style: TextStyle) -> CGFloat {
        switch style {
        case .largeTitle: return 34
        case .title: return 28
        case .title2: return 22
        case .title3: return 20
        case .headline: return 18
        case .body: return 16
        case .callout: return 15
        case .subheadline: return 15
        case .footnote: return 13
        case .caption: return 12
        case .caption2: return 11
        @unknown default: return 16
        }
    }
}

// MARK: - アイコン

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

// MARK: - ボタン

/// 四角いボタンに、紺の影をずらしてつける(snow-pixel.css の .button)。primary は朱色、secondary は白地に紺の枠。
struct PixelButtonStyle: ButtonStyle {
    enum Kind {
        case primary
        case secondary
    }

    private static let shadowOffset: CGFloat = 3
    private static let pressedOffset: CGFloat = 2

    var kind: Kind = .primary
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        let shift = configuration.isPressed ? Self.pressedOffset : 0
        return configuration.label
            .font(.dot(.body))
            .frame(maxWidth: .infinity, minHeight: 56)
            .padding(.horizontal, 12)
            .foregroundStyle(kind == .primary ? Palette.white : Palette.navy)
            .background(kind == .primary ? Palette.vermilion : Palette.wash)
            .overlay(Rectangle().stroke(Palette.navy, lineWidth: 2))
            .background(
                Rectangle().fill(Palette.navy)
                    .offset(x: Self.shadowOffset - shift, y: Self.shadowOffset - shift)
                    .opacity(isEnabled ? 1 : 0)
            )
            .offset(x: shift, y: shift)
            .opacity(isEnabled ? 1 : 0.45)
    }
}

extension ButtonStyle where Self == PixelButtonStyle {
    static var pixel: PixelButtonStyle { PixelButtonStyle(kind: .primary) }
    static var pixelSecondary: PixelButtonStyle { PixelButtonStyle(kind: .secondary) }
}

/// テスト用のボタン(小さく灰色の文字、下線つき。template.css の .test-tool)。
struct TestToolButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.dot(.footnote))
            .underline()
            .foregroundStyle(Palette.testGray)
            .padding(.horizontal, 6)
            .padding(.vertical, 4)
            .opacity(configuration.isPressed ? 0.5 : 1)
    }
}

/// 画面のいちばん下にまとめる、テスト用のボタンの列(点線の区切りの下に「テスト: 〇〇」)。
struct TestTools<Content: View>: View {
    @ViewBuilder let content: Content

    var body: some View {
        VStack(spacing: 6) {
            Rectangle()
                .stroke(style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
                .frame(height: 1)
                .foregroundStyle(Palette.testGray.opacity(0.6))
            HStack(spacing: 14) { content }
                .buttonStyle(TestToolButtonStyle())
                .frame(maxWidth: .infinity)
        }
        .padding(.top, 20)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("テスト用")
    }
}

// MARK: - カード・見出し

/// ドット絵のカード(白地に紺の枠、影をずらす)。
struct PixelCard<Content: View>: View {
    @ViewBuilder let content: Content
    private var shadowOffset: CGFloat { 4 }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) { content }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Palette.white)
            .overlay(Rectangle().stroke(Palette.navy, lineWidth: 2))
            .background(Rectangle().fill(Palette.navy).offset(x: shadowOffset, y: shadowOffset))
            .padding(.trailing, shadowOffset)
            .padding(.bottom, shadowOffset)
    }
}

/// 失敗したときの赤い文。空なら何も出さない。
struct ErrorText: View {
    let message: String?

    var body: some View {
        if let message, !message.isEmpty {
            IconLabel(icon: "warning", text: message)
                .font(.dot(.callout))
                .foregroundStyle(Palette.vermilion)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

/// 画面の大きな見出し(Web の h1)。
struct ScreenTitle: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.dot(size: 30, relativeTo: .largeTitle))
            .foregroundStyle(Palette.navy)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, 12)
            .accessibilityAddTraits(.isHeader)
    }
}

/// いちばん上の行「ユキカキ・レイド / 美唄」(Web の .brand-line)。
struct BrandLine: View {
    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Image("icon-shovel")
                    .resizable()
                    .renderingMode(.template)
                    .interpolation(.none)
                    .frame(width: 20, height: 24)
                    .foregroundStyle(Palette.vermilion)
                    .accessibilityHidden(true)
                Text("ユキカキ・レイド").font(.dot(.callout)).foregroundStyle(Palette.navy)
                Spacer()
                Text("美唄").font(.dot(.subheadline)).foregroundStyle(Palette.muted)
            }
            .frame(minHeight: 60)
            Rectangle().fill(Palette.navy).frame(height: 2)
        }
        .accessibilityElement(children: .combine)
    }
}

/// 雪の多さ(雪の結晶 1〜3 個)。
struct SnowAmountView: View {
    let amount: SnowAmount

    var body: some View {
        HStack(spacing: 2) {
            ForEach(0..<amount.flakes, id: \.self) { _ in PixelIcon(name: "snowflake", size: 16) }
            Text("雪 \(amount.label)").font(.dot(.footnote))
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("雪の多さ \(amount.label)")
    }
}

/// 白い背景で、上下にスクロールできる画面の枠。いちばん上に「ユキカキ・レイド / 美唄」の行。
struct ScreenScaffold<Content: View>: View {
    @ViewBuilder let content: Content

    var body: some View {
        VStack(spacing: 0) {
            // 上の紺の線(snow-pixel.css の body の border-top)
            Rectangle().fill(Palette.navy).frame(height: 4)
            ScrollView {
                VStack(spacing: 16) {
                    BrandLine()
                    content
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 32)
            }
        }
        .background(Palette.white.ignoresSafeArea())
        .foregroundStyle(Palette.navy)
        .font(.dot(.body))
    }
}

/// 経過時間を「12:34」や「1:02:03」の形にする。
func formatElapsed(_ seconds: TimeInterval) -> String {
    let total = max(0, Int(seconds))
    let h = total / 3600, m = (total % 3600) / 60, s = total % 60
    return h > 0 ? String(format: "%d:%02d:%02d", h, m, s) : String(format: "%02d:%02d", m, s)
}

/// kcal を「約 12」の形の整数にする。
func formatKcal(_ kcal: Double) -> String {
    Int(max(0, kcal).rounded()).formatted()
}
