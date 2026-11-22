// 音の合言葉(スマホを近づけて到着)の、音の作り方と聞き取り方(純粋関数。画面やブラウザの機能は使わない)。
// - 合言葉(4 桁)を「はじめの合図 S → 数字 4 つ」の音の列にして、1 つずつ違う高さの音で鳴らす(FSK という方式)
// - 聞く側は、マイクの音を周波数ごとに分け(FFT)、候補の周波数のうちいちばん大きいものを、その瞬間の記号とする
// - 一瞬だけの記号は雑音として捨て、STABLE_FRAMES 回つづいたら「聞こえた」とする
// - 合言葉のとなり合う数字は同じにしない(サーバー側で作るときに決めている)ので、記号が変わったら次の数字とわかる
// 鳴らす・聞く(Web Audio とマイク)は sound-checkin.js。

/** 1 つの記号を鳴らす長さ(ミリ秒)と、合言葉 1 回ぶんのあとの休み(ミリ秒)。 */
export const SYMBOL_MS = 140;
export const PAUSE_MS = 300;
/** 同じ記号がこの回数つづいたら「聞こえた」とする(聞く側は 20 ミリ秒ごとに読む)。 */
export const STABLE_FRAMES = 2;
/** 雑音より何 dB 大きければ音とみなすか、2 番目の候補と何 dB 離れていれば決めるか。 */
const MIN_ABOVE_NOISE_DB = 15;
const MIN_LEAD_DB = 6;

/**
 * 使う音の高さ。high = 人には聞こえにくい高い音(17.5〜18.8kHz)、low = 聞こえる音(高い音が出ない・拾えない端末用)。
 * 聞く側は両方を同時に聞く。
 */
export const BANDS = Object.freeze({
  high: Object.freeze({ name: "high", digitBase: 17_500, digitStep: 120, start: 18_800 }),
  low: Object.freeze({ name: "low", digitBase: 1_000, digitStep: 180, start: 2_900 }),
});

const SYMBOLS = Object.freeze(["S", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]);

/**
 * 合言葉 → 鳴らす記号の列。
 * @param {string} code 4 桁の数字
 * @returns {string[]}
 */
export const symbolsFor = (code) => ["S", ...code.split("")];

/**
 * 記号 → 周波数(Hz)。
 * @param {{ digitBase: number, digitStep: number, start: number }} band
 * @param {string} symbol "S" か "0"〜"9"
 * @returns {number}
 */
export function frequencyOf(band, symbol) {
  return symbol === "S" ? band.start : band.digitBase + Number(symbol) * band.digitStep;
}

/** その周波数あたり(前後 1 つずつの区切り)の、いちばん大きい音量(dB)。 */
function levelAt(spectrum, binHz, frequency) {
  const center = Math.round(frequency / binHz);
  let level = -Infinity;
  for (let i = center - 1; i <= center + 1; i += 1) {
    if (i >= 0 && i < spectrum.length) level = Math.max(level, spectrum[i]);
  }
  return level;
}

/** 使う音の高さのあたりの、雑音の大きさ(音量のまん中の値)。 */
function noiseFloor(spectrum, binHz, band) {
  const low = Math.max(0, Math.floor((band.digitBase - 400) / binHz));
  const high = Math.min(spectrum.length - 1, Math.ceil((band.start + 400) / binHz));
  const values = Array.from(spectrum.slice(low, high + 1)).filter(Number.isFinite).sort((a, b) => a - b);
  return values.length > 0 ? values[Math.floor(values.length / 2)] : -Infinity;
}

/**
 * スペクトル(マイクの音を周波数ごとに分けた音量。dB)から、いま鳴っている記号を選ぶ。決められなければ null。
 * @param {ArrayLike<number>} spectrum AnalyserNode.getFloatFrequencyData の結果
 * @param {{ sampleRate: number, fftSize: number }} options
 * @param {{ digitBase: number, digitStep: number, start: number }} band
 * @returns {string | null}
 */
export function pickSymbol(spectrum, { sampleRate, fftSize }, band) {
  const binHz = sampleRate / fftSize;
  const levels = SYMBOLS.map((symbol) => ({ symbol, db: levelAt(spectrum, binHz, frequencyOf(band, symbol)) })).sort(
    (a, b) => b.db - a.db,
  );
  const [best, second] = levels;
  if (best.db - noiseFloor(spectrum, binHz, band) < MIN_ABOVE_NOISE_DB) return null;
  if (best.db - second.db < MIN_LEAD_DB) return null;
  return best.symbol;
}

/** 聞き取りのはじめの状態。 */
export const EMPTY_DECODER = Object.freeze({ last: null, run: 0, accepted: null, digits: null });

/**
 * 記号を 1 つ読み進める。合言葉が 4 桁そろったら code に入れて返す。
 * @param {{ last: string | null, run: number, accepted: string | null, digits: string | null }} state
 * @param {string | null} symbol いま聞こえた記号(聞こえなければ null)
 * @returns {{ state: typeof state, code: string | null }}
 */
export function stepDecoder(state, symbol) {
  const run = symbol === state.last ? state.run + 1 : 1;
  const next = { ...state, last: symbol, run };
  if (run !== STABLE_FRAMES || symbol === state.accepted) return { state: next, code: null };
  // ここで「symbol が聞こえた」と決まる
  if (symbol === null) return { state: { ...next, accepted: null }, code: null };
  if (symbol === "S") return { state: { ...next, accepted: symbol, digits: "" }, code: null };
  if (state.digits === null) return { state: { ...next, accepted: symbol }, code: null };
  const digits = state.digits + symbol;
  if (digits.length < 4) return { state: { ...next, accepted: symbol, digits }, code: null };
  return { state: { ...next, accepted: symbol, digits: null }, code: digits };
}
