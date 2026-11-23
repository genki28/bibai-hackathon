// 音を鳴らす共通の部分(AVFoundation)。作った波形(数字の列)を、1 回またはくり返し鳴らす。
// - 音の種類は「再生」(playback)にして、ほかのアプリの音と混ぜる。画面を閉じても鳴らせる(Info.plist の audio)
// - 「ザクッ」・ファンファーレ・音の合言葉は、どれも音のファイルを使わず、その場で波形を作る

import AVFoundation
import Foundation

enum AudioSessionSetup {
    /// 音を鳴らせるようにする(何度呼んでもよい)。
    static func activate() {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
            try session.setActive(true)
        } catch {
            NSLog("音の準備ができませんでした: %@", error.localizedDescription)
        }
    }
}

/// 1 つの音の出口(エンジンと再生の部品)。
final class AudioOutput {
    let sampleRate: Double
    private let engine = AVAudioEngine()
    private let player = AVAudioPlayerNode()
    private let format: AVAudioFormat

    init(sampleRate: Double) {
        self.sampleRate = sampleRate
        format = AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: 1)!
        engine.attach(player)
        engine.connect(player, to: engine.mainMixerNode, format: format)
    }

    /// 波形を鳴らす。loops が true なら止めるまでくり返す。
    func play(_ samples: [Float], loops: Bool = false, interrupt: Bool = false) {
        guard let buffer = makeBuffer(samples), ensureRunning() else { return }
        if interrupt { player.stop() }
        player.scheduleBuffer(buffer, at: nil, options: loops ? [.loops] : [], completionHandler: nil)
        if !player.isPlaying { player.play() }
    }

    func stop() {
        player.stop()
    }

    private func ensureRunning() -> Bool {
        if engine.isRunning { return true }
        AudioSessionSetup.activate()
        do {
            try engine.start()
            return true
        } catch {
            NSLog("音を鳴らせませんでした: %@", error.localizedDescription)
            return false
        }
    }

    private func makeBuffer(_ samples: [Float]) -> AVAudioPCMBuffer? {
        guard !samples.isEmpty,
              let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(samples.count)),
              let channel = buffer.floatChannelData?[0]
        else { return nil }
        buffer.frameLength = AVAudioFrameCount(samples.count)
        samples.withUnsafeBufferPointer { source in
            channel.update(from: source.baseAddress!, count: samples.count)
        }
        return buffer
    }
}
