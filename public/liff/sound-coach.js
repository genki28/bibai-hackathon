// 【若者】雪かき中の「音の実況」(ブラウザの部分)。雪かき中はスマホを見られないので、音と声で知らせる。
// - すくうたびに「ザクッ」(白い雑音を短く鳴らす。音のファイルは使わない = Web Audio API)
// - 節目のことばはブラウザの読み上げ(speechSynthesis)で日本語で読む。たとえの重さを超えたらファンファーレ
// - スマホは、利用者がボタンを押した処理の中でしか音を出し始められない。unlock() はボタンを押したときに呼ぶ
// - オン / オフは端末(localStorage)に覚える。最初はオン
// 決まり(いつ何を言うか)は snow-moved.js。

const STORAGE_KEY = "sound-coach:on";
/** 「ザクッ」の長さ(秒)と大きさ。 */
const SCOOP_SECONDS = 0.12;
const SCOOP_VOLUME = 0.5;
/** ファンファーレの音(ドミソド)と 1 音の長さ(秒)。 */
const FANFARE_NOTES = Object.freeze([523, 659, 784, 1047]);
const FANFARE_NOTE_SECONDS = 0.14;
const FANFARE_VOLUME = 0.15;
/** 読み上げの速さ(1 が普通)。 */
const SPEECH_RATE = 1.1;

function loadIsOn() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

function saveIsOn(isOn) {
  try {
    localStorage.setItem(STORAGE_KEY, isOn ? "on" : "off");
  } catch (error) {
    console.error("音の設定を端末に覚えておけませんでした", error);
  }
}

/** 白い雑音(ザッという音のもと)を 1 回ぶん作る。 */
function createNoise(context, seconds) {
  const length = Math.floor(context.sampleRate * seconds);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/**
 * 音の実況を作る。
 * @returns {{
 *   unlock: () => void, isOn: () => boolean, setOn: (isOn: boolean) => void,
 *   scoop: () => void, fanfare: () => void, say: (text: string) => void,
 * }}
 */
export function createSoundCoach() {
  const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
  const speech = window.speechSynthesis ?? null;
  let context = null;
  let noise = null;
  let isOn = loadIsOn();

  /** ボタンを押した処理の中で呼ぶ。音を出せるようにして、読み上げも 1 度だけ空で呼んでおく(iPhone 用)。 */
  function unlock() {
    try {
      if (!context && AudioContextClass) {
        context = new AudioContextClass();
        noise = createNoise(context, SCOOP_SECONDS);
      }
      context?.resume();
      speech?.speak(new SpeechSynthesisUtterance(""));
    } catch (error) {
      console.error("音を出す準備ができませんでした", error);
    }
  }

  const canPlay = () => isOn && context !== null && context.state === "running";

  function scoop() {
    if (!canPlay()) return;
    const source = context.createBufferSource();
    source.buffer = noise;
    // 低めの帯だけ残すと、雪にスコップを差したような「ザクッ」になる
    const filter = context.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1200;
    const gain = context.createGain();
    const now = context.currentTime;
    gain.gain.setValueAtTime(SCOOP_VOLUME, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + SCOOP_SECONDS);
    source.connect(filter).connect(gain).connect(context.destination);
    source.start(now);
  }

  function fanfare() {
    if (!canPlay()) return;
    const start = context.currentTime;
    FANFARE_NOTES.forEach((frequency, i) => {
      const osc = context.createOscillator();
      osc.type = "square"; // ゲーム機のような音
      osc.frequency.value = frequency;
      const gain = context.createGain();
      const at = start + i * FANFARE_NOTE_SECONDS;
      const length = i === FANFARE_NOTES.length - 1 ? FANFARE_NOTE_SECONDS * 3 : FANFARE_NOTE_SECONDS;
      gain.gain.setValueAtTime(FANFARE_VOLUME, at);
      gain.gain.exponentialRampToValueAtTime(0.001, at + length);
      osc.connect(gain).connect(context.destination);
      osc.start(at);
      osc.stop(at + length);
    });
  }

  function say(text) {
    if (!isOn || !speech) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ja-JP";
    utterance.rate = SPEECH_RATE;
    speech.cancel(); // 前のことばが残っていたら、新しいほうを優先
    speech.speak(utterance);
  }

  return {
    unlock,
    isOn: () => isOn,
    setOn(next) {
      isOn = next;
      saveIsOn(isOn);
      if (!isOn) speech?.cancel();
    },
    scoop,
    fanfare,
    say,
  };
}
