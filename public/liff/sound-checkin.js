// 音の合言葉(スマホを近づけて到着)の、鳴らす・聞く部分(ブラウザの Web Audio とマイク)。
// - 若者のスマホ: playCode で自分の合言葉を高い音でくり返し鳴らす(若者は何人も来るので、鳴らす側にしている)
// - お年寄りのスマホ: listenWithMicrophone でマイクの音を読み、合言葉が聞こえたら onCode を呼ぶ
// - 音はどこにも送らない(スマホの中で周波数を調べるだけ)。サーバーに送るのは聞き取った 4 桁だけ
// 音の作り方と聞き取り方の決まりは sound-code.js。
// スマホは、ボタンを押した処理の中でしか音を出し始められない。createAudioContext はボタンを押したときに呼ぶ。

import { BANDS, EMPTY_DECODER, PAUSE_MS, SYMBOL_MS, frequencyOf, pickSymbol, stepDecoder, symbolsFor } from "./sound-code.js";

/** 音の大きさ(高い音はスピーカーで小さくなりやすいので大きめ)。 */
const VOLUME = Object.freeze({ high: 0.9, low: 0.25 });
/** 音の立ち上がり・終わりをなめらかにする時間(秒)。プツッという音を防ぐ。 */
const RAMP_SECONDS = 0.008;
/** どれだけ先まで鳴らす予定を入れておくか(秒)。 */
const SCHEDULE_AHEAD_SECONDS = 1.5;
/** マイクの音を読む間隔(ミリ秒)と、周波数に分けるときの細かさ。 */
const LISTEN_INTERVAL_MS = 20;
const FFT_SIZE = 2048;

/** 音を出す・聞く準備。ボタンを押した処理の中で呼ぶ。 */
export function createAudioContext() {
  const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
  if (!AudioContextClass) throw new Error("この端末では音を使えません");
  const context = new AudioContextClass();
  context.resume();
  return context;
}

/** 1 つの記号の音を、at 秒から鳴らす予定を入れる。 */
function scheduleTone(context, destination, frequency, at, volume) {
  const seconds = SYMBOL_MS / 1000;
  const osc = context.createOscillator();
  osc.frequency.value = frequency;
  const gain = context.createGain();
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(volume, at + RAMP_SECONDS);
  gain.gain.setValueAtTime(volume, at + seconds - RAMP_SECONDS);
  gain.gain.linearRampToValueAtTime(0, at + seconds);
  osc.connect(gain).connect(destination);
  osc.start(at);
  osc.stop(at + seconds);
}

/**
 * 合言葉を、止めるまでくり返し鳴らす。
 * @param {AudioContext} context
 * @param {string} code 4 桁の数字
 * @param {{ bandName?: "high" | "low", destination?: AudioNode }} [options] destination はテスト用(スピーカーの代わり)
 * @returns {{ stop: () => void }}
 */
export function playCode(context, code, { bandName = "high", destination = context.destination } = {}) {
  const band = BANDS[bandName];
  const symbols = symbolsFor(code);
  const cycleSeconds = (symbols.length * SYMBOL_MS + PAUSE_MS) / 1000;
  let nextAt = context.currentTime + 0.05;
  function fill() {
    while (nextAt < context.currentTime + SCHEDULE_AHEAD_SECONDS) {
      symbols.forEach((symbol, i) => {
        scheduleTone(context, destination, frequencyOf(band, symbol), nextAt + (i * SYMBOL_MS) / 1000, VOLUME[bandName]);
      });
      nextAt += cycleSeconds;
    }
  }
  fill();
  const timer = setInterval(fill, 300);
  return { stop: () => clearInterval(timer) };
}

/**
 * 音を読んで、合言葉が聞こえたら onCode を呼ぶ。高い音と聞こえる音の両方を同時に聞く。
 * @param {AudioContext} context
 * @param {AudioNode} source マイク(または、テスト用に playCode の音)
 * @param {(code: string) => void} onCode
 * @param {(level: number) => void} [onLevel] いまの音の大きさ(0〜1。画面の目安用)
 * @returns {{ stop: () => void }}
 */
export function listenToSource(context, source, onCode, onLevel = () => {}) {
  const analyser = context.createAnalyser();
  analyser.fftSize = FFT_SIZE;
  analyser.smoothingTimeConstant = 0;
  source.connect(analyser);
  // ブラウザによっては、スピーカーまでつながっていない部品は動かないので、音量 0 でつないでおく
  const mute = context.createGain();
  mute.gain.value = 0;
  analyser.connect(mute).connect(context.destination);
  const spectrum = new Float32Array(analyser.frequencyBinCount);
  const options = { sampleRate: context.sampleRate, fftSize: FFT_SIZE };
  const decoders = { high: EMPTY_DECODER, low: EMPTY_DECODER };
  const timer = setInterval(() => {
    analyser.getFloatFrequencyData(spectrum);
    let best = -Infinity;
    Object.keys(decoders).forEach((name) => {
      const symbol = pickSymbol(spectrum, options, BANDS[name]);
      const result = stepDecoder(decoders[name], symbol);
      decoders[name] = result.state;
      if (result.code) onCode(result.code);
      best = Math.max(best, symbol ? 1 : 0);
    });
    onLevel(best);
  }, LISTEN_INTERVAL_MS);
  return {
    stop() {
      clearInterval(timer);
      source.disconnect(analyser);
      mute.disconnect();
    },
  };
}

/**
 * マイクを開いて聞く。音の加工(雑音を消す・音量をそろえる)は、高い音が消えないように切る。
 * @param {AudioContext} context
 * @param {(code: string) => void} onCode
 * @param {(level: number) => void} [onLevel]
 * @returns {Promise<{ stop: () => void }>}
 */
export async function listenWithMicrophone(context, onCode, onLevel) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("この端末ではマイクを使えません");
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  const listener = listenToSource(context, context.createMediaStreamSource(stream), onCode, onLevel);
  return {
    stop() {
      listener.stop();
      stream.getTracks().forEach((track) => track.stop());
    },
  };
}
