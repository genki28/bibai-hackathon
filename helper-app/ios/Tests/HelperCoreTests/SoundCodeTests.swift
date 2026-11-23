// 音の合言葉のテスト(tests/sound-code.test.ts と同じ内容 + 鳴らし方の並び)。
import HelperCore
import XCTest

private let sampleRate = 48_000.0
private let fftSize = 2048
private let binHz = sampleRate / Double(fftSize)
private let noiseDb = -100.0

/// 指定した周波数だけが大きい、作り物のスペクトル(dB)。
private func spectrumWith(_ tones: [(hz: Double, db: Double)]) -> [Double] {
    var spectrum = [Double](repeating: noiseDb, count: fftSize / 2)
    for tone in tones { spectrum[Int((tone.hz / binHz).rounded())] = tone.db }
    return spectrum
}

private func s(_ text: String) -> SoundSymbol? { SoundSymbol(text) }

/// 記号の列を、1 つあたり frames 回ずつ読んだことにして、聞き取れた合言葉を返す。
private func decode(_ symbols: [SoundSymbol?], frames: Int = SoundCode.stableFrames + 2) -> [String] {
    var state = DecoderState.empty
    var codes: [String] = []
    for symbol in symbols {
        for _ in 0..<frames {
            let result = stepDecoder(state, symbol)
            state = result.state
            if let code = result.code { codes.append(code) }
        }
    }
    return codes
}

final class SymbolsForTests: XCTestCase {
    func test_はじめの合図のあとに4桁の数字() {
        XCTAssertEqual(symbolsFor("2719").map(\.text), ["S", "2", "7", "1", "9"])
    }
}

final class FrequencyOfTests: XCTestCase {
    func test_数字ごとに違う周波数で_はじめの合図はどの数字とも違う() {
        let all = ["S", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"].map { frequencyOf(.high, s($0)!) }
        XCTAssertEqual(Set(all).count, all.count)
    }

    func test_高い音は17kHz以上() {
        XCTAssertGreaterThanOrEqual(frequencyOf(.high, s("0")!), 17_000)
    }

    func test_仕様どおりの周波数と音量() {
        XCTAssertEqual(frequencyOf(.high, s("9")!), 17_500 + 9 * 120)
        XCTAssertEqual(frequencyOf(.high, .start), 18_800)
        XCTAssertEqual(frequencyOf(.low, s("3")!), 1_000 + 3 * 180)
        XCTAssertEqual(frequencyOf(.low, .start), 2_900)
        XCTAssertEqual(SoundBand.high.volume, 0.9)
        XCTAssertEqual(SoundBand.low.volume, 0.25)
    }
}

final class ToneScheduleTests: XCTestCase {
    func test_合図と4桁を140ミリ秒ずつ並べ_1回ぶんは300ミリ秒の休みを足した長さ() {
        let events = toneSchedule("2719", band: .high)
        XCTAssertEqual(events.map(\.frequency), [18_800, 17_740, 18_340, 17_620, 18_580])
        XCTAssertEqual(events.map(\.startMs), [0, 140, 280, 420, 560])
        XCTAssertTrue(events.allSatisfy { $0.durationMs == 140 })
        XCTAssertEqual(cycleMs("2719"), 1000)
    }

    func test_音の立ち上がりと終わりは8ミリ秒でなめらか() {
        XCTAssertEqual(toneEnvelope(atMs: 0, durationMs: 140, volume: 0.9), 0)
        XCTAssertEqual(toneEnvelope(atMs: 4, durationMs: 140, volume: 0.9), 0.45, accuracy: 1e-9)
        XCTAssertEqual(toneEnvelope(atMs: 70, durationMs: 140, volume: 0.9), 0.9)
        XCTAssertEqual(toneEnvelope(atMs: 140, durationMs: 140, volume: 0.9), 0)
    }

    func test_1回ぶんの波形は_休みの間は音がない() {
        let samples = renderCycle("2719", band: .low, sampleRate: sampleRate)
        XCTAssertEqual(samples.count, 48_000)
        // 700 ミリ秒より後(休み)は 0
        XCTAssertTrue(samples[Int(0.71 * sampleRate)...].allSatisfy { $0 == 0 })
        XCTAssertLessThanOrEqual(samples.map { abs($0) }.max() ?? 0, Float(SoundBand.low.volume) + 1e-6)
    }
}

final class PickSymbolTests: XCTestCase {
    func test_いちばん大きい候補の周波数の記号() {
        let spectrum = spectrumWith([(frequencyOf(.high, s("7")!), -40)])
        XCTAssertEqual(pickSymbol(spectrum, sampleRate: sampleRate, fftSize: fftSize, band: .high), s("7"))
    }

    func test_まわりの雑音と差がなければ_何も聞こえていない() {
        let spectrum = spectrumWith([(frequencyOf(.high, s("7")!), noiseDb + 3)])
        XCTAssertNil(pickSymbol(spectrum, sampleRate: sampleRate, fftSize: fftSize, band: .high))
    }

    func test_2つの候補が同じくらい大きければ_決めない() {
        let spectrum = spectrumWith([(frequencyOf(.high, s("3")!), -40), (frequencyOf(.high, s("4")!), -41)])
        XCTAssertNil(pickSymbol(spectrum, sampleRate: sampleRate, fftSize: fftSize, band: .high))
    }
}

final class StepDecoderTests: XCTestCase {
    func test_合図のあとの4桁を聞き取る() {
        XCTAssertEqual(decode(["S", "2", "7", "1", "9"].map(s)), ["2719"])
    }

    func test_合図より前の数字は使わない() {
        XCTAssertEqual(decode([s("1"), s("9"), nil, s("S"), s("2"), s("7"), s("1"), s("9")]), ["2719"])
    }

    func test_一瞬だけの記号は無視する() {
        // 「5」は 1 回しか読めていない(STABLE_FRAMES 回つづかない)ので、雑音として無視される
        var state = DecoderState.empty
        let frames = ["S", "S", "S", "2", "2", "2", "5", "7", "7", "7", "1", "1", "1", "9", "9", "9"].map(s)
        let codes = frames.compactMap { symbol -> String? in
            let result = stepDecoder(state, symbol)
            state = result.state
            return result.code
        }
        XCTAssertEqual(codes, ["2719"])
    }

    func test_くり返し鳴らすと_くり返し聞き取れる() {
        let once: [SoundSymbol?] = ["S", "2", "7", "1", "9"].map(s)
        XCTAssertEqual(decode(once + [nil] + once), ["2719", "2719"])
    }
}
