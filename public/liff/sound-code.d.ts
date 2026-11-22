// sound-code.js の型(TypeScript のテストから使うため)。
export type SoundSymbol = "S" | "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
export type Band = { readonly name: string; readonly digitBase: number; readonly digitStep: number; readonly start: number };
export type DecoderState = {
  readonly last: SoundSymbol | null;
  readonly run: number;
  readonly accepted: SoundSymbol | null;
  readonly digits: string | null;
};

export const SYMBOL_MS: number;
export const PAUSE_MS: number;
export const STABLE_FRAMES: number;
export const BANDS: { readonly high: Band; readonly low: Band };
export const EMPTY_DECODER: DecoderState;
export function symbolsFor(code: string): SoundSymbol[];
export function frequencyOf(band: Band, symbol: SoundSymbol): number;
export function pickSymbol(
  spectrum: ArrayLike<number>,
  options: { readonly sampleRate: number; readonly fftSize: number },
  band: Band,
): SoundSymbol | null;
export function stepDecoder(state: DecoderState, symbol: SoundSymbol | null): { state: DecoderState; code: string | null };
