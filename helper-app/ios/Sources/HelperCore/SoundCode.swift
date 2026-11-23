// 音の合言葉(スマホを近づけて到着)の、音の作り方と聞き取り方(純粋な関数)。
// Web の public/liff/sound-code.js と sound-checkin.js の playCode と同じ(テストも tests/sound-code.test.ts と同じ内容)。
// - 合言葉(4 桁)を「はじめの合図 S → 数字 4 つ」の音の列にして、1 つずつ違う高さの音で鳴らす(FSK という方式)
// - 1 記号 140 ミリ秒、1 回ぶんのあとに 300 ミリ秒休む。立ち上がりと終わりは 8 ミリ秒でなめらかにする
// アプリは鳴らす側だけを使う(聞く側はお年寄りの LIFF)。聞き取り方も、同じ結果になるように移してある。

import Foundation

public enum SoundCode {
    /// 1 つの記号を鳴らす長さ(ミリ秒)と、合言葉 1 回ぶんのあとの休み(ミリ秒)。
    public static let symbolMs = 140.0
    public static let pauseMs = 300.0
    /// 同じ記号がこの回数つづいたら「聞こえた」とする。
    public static let stableFrames = 2
    /// 音の立ち上がり・終わりをなめらかにする時間(ミリ秒)。
    public static let rampMs = 8.0
    static let minAboveNoiseDb = 15.0
    static let minLeadDb = 6.0
    static let allSymbols: [SoundSymbol] = [.start] + (0...9).map { SoundSymbol.digit($0) }
}

/// 鳴らす記号(はじめの合図 S か、数字 0〜9)。
public enum SoundSymbol: Equatable, Hashable, Sendable {
    case start
    case digit(Int)

    /// "S" や "7" から作る。それ以外は nil。
    public init?(_ text: String) {
        if text == "S" {
            self = .start
        } else if let value = Int(text), (0...9).contains(value), text.count == 1 {
            self = .digit(value)
        } else {
            return nil
        }
    }

    public var text: String {
        switch self {
        case .start: return "S"
        case .digit(let value): return String(value)
        }
    }
}

/// 使う音の高さ。high = 人には聞こえにくい高い音、low = 聞こえる音。
public struct SoundBand: Equatable, Sendable {
    public let name: String
    public let digitBase: Double
    public let digitStep: Double
    public let start: Double
    /// 鳴らす音量(0〜1)。
    public let volume: Double

    public static let high = SoundBand(name: "high", digitBase: 17_500, digitStep: 120, start: 18_800, volume: 0.9)
    public static let low = SoundBand(name: "low", digitBase: 1_000, digitStep: 180, start: 2_900, volume: 0.25)
}

/// 合言葉 → 鳴らす記号の列(はじめの合図のあとに 4 桁)。数字でない文字は捨てる。
public func symbolsFor(_ code: String) -> [SoundSymbol] {
    [.start] + code.compactMap { SoundSymbol(String($0)) }
}

/// 記号 → 周波数(Hz)。
public func frequencyOf(_ band: SoundBand, _ symbol: SoundSymbol) -> Double {
    switch symbol {
    case .start: return band.start
    case .digit(let value): return band.digitBase + Double(value) * band.digitStep
    }
}

/// 鳴らす音 1 つ(周波数と、1 回ぶんの中での始まり・長さ)。
public struct ToneEvent: Equatable, Sendable {
    public let frequency: Double
    public let startMs: Double
    public let durationMs: Double
}

/// 合言葉 1 回ぶんの、鳴らす音の並び。
public func toneSchedule(_ code: String, band: SoundBand) -> [ToneEvent] {
    symbolsFor(code).enumerated().map { index, symbol in
        ToneEvent(frequency: frequencyOf(band, symbol), startMs: Double(index) * SoundCode.symbolMs, durationMs: SoundCode.symbolMs)
    }
}

/// 合言葉 1 回ぶんの長さ(ミリ秒)。記号の数 × 140 + 休み 300。
public func cycleMs(_ code: String) -> Double {
    Double(symbolsFor(code).count) * SoundCode.symbolMs + SoundCode.pauseMs
}

/// 音 1 つの中の、その時刻の音量(はじめと終わりの 8 ミリ秒でなめらかに上げ下げする)。
public func toneEnvelope(atMs t: Double, durationMs: Double, volume: Double) -> Double {
    guard t >= 0, t <= durationMs else { return 0 }
    let ramp = SoundCode.rampMs
    if t < ramp { return volume * t / ramp }
    if t > durationMs - ramp { return volume * max(0, durationMs - t) / ramp }
    return volume
}

/// 合言葉 1 回ぶん(休みを含む)の音の波形(-1〜1)。くり返し鳴らせば、続けて聞こえる。
public func renderCycle(_ code: String, band: SoundBand, sampleRate: Double) -> [Float] {
    let total = Int((cycleMs(code) / 1000 * sampleRate).rounded())
    var samples = [Float](repeating: 0, count: total)
    for event in toneSchedule(code, band: band) {
        let first = Int((event.startMs / 1000 * sampleRate).rounded())
        let length = Int((event.durationMs / 1000 * sampleRate).rounded())
        for n in 0..<length where first + n < total {
            let tSec = Double(n) / sampleRate
            let gain = toneEnvelope(atMs: tSec * 1000, durationMs: event.durationMs, volume: band.volume)
            samples[first + n] = Float(gain * sin(2 * Double.pi * event.frequency * tSec))
        }
    }
    return samples
}

// MARK: - 聞き取り方(お年寄りの LIFF と同じ決まり)

/// その周波数あたり(前後 1 つずつの区切り)の、いちばん大きい音量(dB)。
private func levelAt(_ spectrum: [Double], binHz: Double, frequency: Double) -> Double {
    let center = Int((frequency / binHz).rounded())
    return (center - 1...center + 1)
        .filter { spectrum.indices.contains($0) }
        .map { spectrum[$0] }
        .max() ?? -Double.infinity
}

/// 使う音の高さのあたりの、雑音の大きさ(音量のまん中の値)。
private func noiseFloor(_ spectrum: [Double], binHz: Double, band: SoundBand) -> Double {
    let low = max(0, Int(floor((band.digitBase - 400) / binHz)))
    let high = min(spectrum.count - 1, Int(ceil((band.start + 400) / binHz)))
    guard low <= high else { return -Double.infinity }
    let values = spectrum[low...high].filter(\.isFinite).sorted()
    return values.isEmpty ? -Double.infinity : values[values.count / 2]
}

/// スペクトル(周波数ごとの音量。dB)から、いま鳴っている記号を選ぶ。決められなければ nil。
public func pickSymbol(_ spectrum: [Double], sampleRate: Double, fftSize: Int, band: SoundBand) -> SoundSymbol? {
    let binHz = sampleRate / Double(fftSize)
    let levels = SoundCode.allSymbols
        .map { (symbol: $0, db: levelAt(spectrum, binHz: binHz, frequency: frequencyOf(band, $0))) }
        .sorted { $0.db > $1.db }
    let best = levels[0]
    let second = levels[1]
    if best.db - noiseFloor(spectrum, binHz: binHz, band: band) < SoundCode.minAboveNoiseDb { return nil }
    if best.db - second.db < SoundCode.minLeadDb { return nil }
    return best.symbol
}

/// 聞き取りの状態。
public struct DecoderState: Equatable, Sendable {
    public let last: SoundSymbol?
    public let run: Int
    public let accepted: SoundSymbol?
    public let digits: String?

    public init(last: SoundSymbol? = nil, run: Int = 0, accepted: SoundSymbol? = nil, digits: String? = nil) {
        self.last = last
        self.run = run
        self.accepted = accepted
        self.digits = digits
    }

    public static let empty = DecoderState()
}

/// 記号を 1 つ読み進める。合言葉が 4 桁そろったら code に入れて返す。
public func stepDecoder(_ state: DecoderState, _ symbol: SoundSymbol?) -> (state: DecoderState, code: String?) {
    let run = symbol == state.last ? state.run + 1 : 1
    let next = DecoderState(last: symbol, run: run, accepted: state.accepted, digits: state.digits)
    if run != SoundCode.stableFrames || symbol == state.accepted { return (next, nil) }
    // ここで「symbol が聞こえた」と決まる
    guard let symbol else { return (DecoderState(last: nil, run: run, accepted: nil, digits: state.digits), nil) }
    if symbol == .start { return (DecoderState(last: symbol, run: run, accepted: symbol, digits: ""), nil) }
    guard let before = state.digits else { return (DecoderState(last: symbol, run: run, accepted: symbol, digits: nil), nil) }
    let digits = before + symbol.text
    if digits.count < 4 { return (DecoderState(last: symbol, run: run, accepted: symbol, digits: digits), nil) }
    return (DecoderState(last: symbol, run: run, accepted: symbol, digits: nil), digits)
}
