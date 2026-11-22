import { describe, expect, test } from "vitest";
import {
  BANDS,
  EMPTY_DECODER,
  STABLE_FRAMES,
  frequencyOf,
  pickSymbol,
  stepDecoder,
  symbolsFor,
} from "../public/liff/sound-code.js";
import type { DecoderState, SoundSymbol } from "../public/liff/sound-code.js";

const SAMPLE_RATE = 48_000;
const FFT_SIZE = 2048;
const BIN_HZ = SAMPLE_RATE / FFT_SIZE;
const NOISE_DB = -100;

/** 指定した周波数だけが大きい、作り物のスペクトル(dB)。 */
function spectrumWith(tones: Array<{ hz: number; db: number }>): Float32Array {
  const spectrum = new Float32Array(FFT_SIZE / 2).fill(NOISE_DB);
  tones.forEach(({ hz, db }) => {
    spectrum[Math.round(hz / BIN_HZ)] = db;
  });
  return spectrum;
}

/** 記号の列を、1 つあたり frames 回ずつ読んだことにして、聞き取れた合言葉を返す。 */
function decode(symbols: Array<SoundSymbol | null>, frames = STABLE_FRAMES + 2): string[] {
  let state: DecoderState = EMPTY_DECODER;
  const codes: string[] = [];
  symbols.forEach((symbol) => {
    for (let i = 0; i < frames; i += 1) {
      const result = stepDecoder(state, symbol);
      state = result.state;
      if (result.code) codes.push(result.code);
    }
  });
  return codes;
}

describe("symbolsFor(合言葉 → 鳴らす記号の列)", () => {
  test("はじめの合図のあとに、4 桁の数字", () => {
    expect(symbolsFor("2719")).toEqual(["S", "2", "7", "1", "9"]);
  });
});

describe("frequencyOf(記号 → 周波数)", () => {
  test("数字ごとに違う周波数で、はじめの合図はどの数字とも違う", () => {
    const all = ["S", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"].map((s) =>
      frequencyOf(BANDS.high, s as SoundSymbol),
    );
    expect(new Set(all).size).toBe(all.length);
  });

  test("高い音は 17kHz 以上(人には聞こえにくい)", () => {
    expect(frequencyOf(BANDS.high, "0")).toBeGreaterThanOrEqual(17_000);
  });
});

describe("pickSymbol(スペクトル → 記号)", () => {
  const options = { sampleRate: SAMPLE_RATE, fftSize: FFT_SIZE };

  test("いちばん大きい候補の周波数の記号", () => {
    const spectrum = spectrumWith([{ hz: frequencyOf(BANDS.high, "7"), db: -40 }]);
    expect(pickSymbol(spectrum, options, BANDS.high)).toBe("7");
  });

  test("まわりの雑音と差がなければ、何も聞こえていない(null)", () => {
    const spectrum = spectrumWith([{ hz: frequencyOf(BANDS.high, "7"), db: NOISE_DB + 3 }]);
    expect(pickSymbol(spectrum, options, BANDS.high)).toBeNull();
  });

  test("2 つの候補が同じくらい大きければ、決めない(null)", () => {
    const spectrum = spectrumWith([
      { hz: frequencyOf(BANDS.high, "3"), db: -40 },
      { hz: frequencyOf(BANDS.high, "4"), db: -41 },
    ]);
    expect(pickSymbol(spectrum, options, BANDS.high)).toBeNull();
  });
});

describe("stepDecoder(記号の流れ → 合言葉)", () => {
  test("合図のあとの 4 桁を聞き取る", () => {
    expect(decode(["S", "2", "7", "1", "9"])).toEqual(["2719"]);
  });

  test("合図より前の数字は使わない(途中から聞き始めても、次の合図から読む)", () => {
    expect(decode(["1", "9", null, "S", "2", "7", "1", "9"])).toEqual(["2719"]);
  });

  test("一瞬だけの記号(雑音)は無視する", () => {
    // 「5」は 1 回しか読めていない(STABLE_FRAMES 回つづかない)ので、雑音として無視される
    let state: DecoderState = EMPTY_DECODER;
    const frames: Array<SoundSymbol | null> = ["S", "S", "S", "2", "2", "2", "5", "7", "7", "7", "1", "1", "1", "9", "9", "9"];
    const codes = frames.flatMap((symbol) => {
      const result = stepDecoder(state, symbol);
      state = result.state;
      return result.code ? [result.code] : [];
    });
    expect(codes).toEqual(["2719"]);
  });

  test("くり返し鳴らすと、くり返し聞き取れる", () => {
    expect(decode(["S", "2", "7", "1", "9", null, "S", "2", "7", "1", "9"])).toEqual(["2719", "2719"]);
  });
});
