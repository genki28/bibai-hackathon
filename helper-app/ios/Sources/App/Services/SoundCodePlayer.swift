// 音の合言葉を鳴らす(到着の画面)。音の並びと周波数は HelperCore の renderCycle(sound-code.js と同じ)。
// 合言葉 1 回ぶん(1 秒)の波形を作り、止めるまで(最長 3 分)くり返し鳴らす。

import Foundation
import HelperCore

@MainActor
final class SoundCodePlayer {
    /// くり返し鳴らす長さ(秒)。
    static let maxPlaySeconds: TimeInterval = 180
    /// 18.8kHz まで出すので、48kHz で作る。
    private static let sampleRate = 48_000.0

    private let output = AudioOutput(sampleRate: SoundCodePlayer.sampleRate)
    private var stopTimer: Timer?
    private var renderTask: Task<Void, Never>?
    private(set) var isPlaying = false

    /// 鳴らし始める(すでに鳴っていれば、新しい音に切り替える)。onEnd は 3 分たって止まったときに呼ぶ。
    func play(code: String, band: SoundBand, onEnd: @escaping @MainActor () -> Void) {
        stop()
        isPlaying = true
        // 波形づくり(1 秒ぶん・48,000 個)は裏で計算して、画面の動きを止めない
        let sampleRate = Self.sampleRate
        renderTask = Task {
            let samples = await Task.detached(priority: .userInitiated) {
                renderCycle(code, band: band, sampleRate: sampleRate)
            }.value
            guard !Task.isCancelled, self.isPlaying else { return }
            self.output.play(samples, loops: true, interrupt: true)
        }
        stopTimer = Timer.scheduledTimer(withTimeInterval: Self.maxPlaySeconds, repeats: false) { _ in
            Task { @MainActor in
                self.stop()
                onEnd()
            }
        }
    }

    func stop() {
        renderTask?.cancel()
        renderTask = nil
        stopTimer?.invalidate()
        stopTimer = nil
        output.stop()
        isPlaying = false
    }
}
