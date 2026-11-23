// 画面 1「はじめに」: 名前を入れて [はじめる]。名前は端末に保存する(次からは飛ばす)。

import SwiftUI

struct OnboardingView: View {
    @EnvironmentObject private var app: AppModel
    @State private var name = ""
    @State private var isSaving = false
    @FocusState private var isFocused: Bool

    private var trimmed: String { name.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        ScreenScaffold {
            Spacer(minLength: 40)
            PixelIcon(name: "snowman", size: 96)
            Text("美唄の雪かきを\nいっしょに助けよう")
                .font(.dot(.title))
                .multilineTextAlignment(.center)
            PixelCard {
                Text("あなたの名前(ニックネームでも OK)").font(.dot(.headline))
                TextField("例: ゆき", text: $name)
                    .textFieldStyle(.plain)
                    .padding(12)
                    .background(Palette.wash)
                    .overlay(Rectangle().stroke(Palette.navy, lineWidth: 2))
                    .focused($isFocused)
                    .submitLabel(.done)
                    .onChange(of: name) { _, next in
                        if next.count > UserStore.maxNameLength { name = String(next.prefix(UserStore.maxNameLength)) }
                    }
                Text("お年寄りや仲間に表示されます").font(.dot(.footnote))
            }
            Button {
                isSaving = true
                Task {
                    await app.saveName(trimmed)
                    isSaving = false
                }
            } label: {
                Text(isSaving ? "準備しています…" : "はじめる")
            }
            .buttonStyle(.pixel)
            .disabled(trimmed.isEmpty || isSaving)
        }
        .onAppear { isFocused = true }
    }
}
