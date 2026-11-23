// 雪かき中の「音の実況」。雪かき中はスマホを見られないので、音と声で知らせる(public/liff/sound-coach.js と同じ)。
// - すくうたびに「ザクッ」(短い雑音)
// - 節目のことばは日本語で読み上げる(AVSpeechSynthesizer)。たとえの重さを超えたらファンファーレ
// - オン / オフは端末に覚える。最初はオン。画面を閉じていても鳴らす

import AVFoundation
import Foundation

@MainActor
final class SoundCoach {
    private static let sampleRate = 44_100.0
    /// 「ザクッ」の長さ(秒)と大きさ。
    private static let scoopSeconds = 0.12
    private static let scoopVolume: Float = 0.5
    /// ファンファーレの音(ドミソド)と 1 音の長さ(秒)・大きさ。
    private static let fanfareNotes: [Double] = [523, 659, 784, 1047]
    private static let fanfareNoteSeconds = 0.14
    private static let fanfareVolume: Float = 0.15
    /// 読み上げの速さ(ふつうの 1.1 倍)。
    private static let speechRateScale: Float = 1.1

    private let output = AudioOutput(sampleRate: SoundCoach.sampleRate)
    private let speech = AVSpeechSynthesizer()
    private lazy var scoopSamples = Self.makeScoopSamples()
    private lazy var fanfareSamples = Self.makeFanfareSamples()

    private(set) var isOn = UserStore.isSoundCoachOn

    func setOn(_ next: Bool) {
        isOn = next
        UserStore.isSoundCoachOn = next
        if !next { speech.stopSpeaking(at: .immediate) }
    }

    func scoop() {
        guard isOn else { return }
        output.play(scoopSamples, interrupt: true)
    }

    func fanfare() {
        guard isOn else { return }
        output.play(fanfareSamples, interrupt: true)
    }

    func say(_ text: String) {
        guard isOn else { return }
        AudioSessionSetup.activate()
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = AVSpeechSynthesisVoice(language: "ja-JP")
        utterance.rate = min(AVSpeechUtteranceMaximumSpeechRate, AVSpeechUtteranceDefaultSpeechRate * Self.speechRateScale)
        // 前のことばが残っていたら、新しいほうを優先
        speech.stopSpeaking(at: .immediate)
        speech.speak(utterance)
    }

    /// 白い雑音を、雪にスコップを差したような帯(1,200Hz あたり)だけ残して、すぐ小さくする。
    private static func makeScoopSamples() -> [Float] {
        let count = Int(sampleRate * scoopSeconds)
        let center = 1200.0
        let q = 1.0
        // バンドパスのフィルター(よく使われる計算式)
        let w0 = 2 * Double.pi * center / sampleRate
        let alpha = sin(w0) / (2 * q)
        let a0 = 1 + alpha
        let b0 = alpha / a0, b2 = -alpha / a0
        let a1 = -2 * cos(w0) / a0, a2 = (1 - alpha) / a0
        var x1 = 0.0, x2 = 0.0, y1 = 0.0, y2 = 0.0
        return (0..<count).map { n in
            let x = Double.random(in: -1...1)
            let y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2
            x2 = x1; x1 = x; y2 = y1; y1 = y
            let decay = pow(0.001, Double(n) / Double(count))
            return Float(y * 2 * decay) * scoopVolume
        }
    }

    /// ゲーム機のような四角い波で、ドミソドと鳴らす(最後の音は長め)。
    private static func makeFanfareSamples() -> [Float] {
        fanfareNotes.enumerated().flatMap { index, frequency -> [Float] in
            let seconds = index == fanfareNotes.count - 1 ? fanfareNoteSeconds * 3 : fanfareNoteSeconds
            let count = Int(sampleRate * seconds)
            let noteCount = Int(sampleRate * fanfareNoteSeconds)
            let samples: [Float] = (0..<count).map { n in
                let t = Double(n) / sampleRate
                let square: Float = sin(2 * Double.pi * frequency * t) >= 0 ? 1 : -1
                let decay = Float(pow(0.001, Double(n) / Double(count)))
                return square * fanfareVolume * decay
            }
            // 次の音は、前の音の 0.14 秒後に始める(最後以外は長さがちょうど 0.14 秒)
            return index == fanfareNotes.count - 1 ? samples : Array(samples.prefix(noteCount))
        }
    }
}
