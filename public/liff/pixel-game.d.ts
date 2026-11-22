// pixel-game.js の型(TypeScript のテストから使うため)。
export type ComboState = { readonly count: number; readonly lastTapAt: number };

export const MINUTES_PER_LEVEL: number;
export const MAX_LEVEL: number;
export const PILE_CLEAR_MINUTES: number;
export const PILE_MIN_REMAINING: number;
export const COMBO_GRACE_MS: number;
export const COMBO_DECAY_STEP_MS: number;
export const FLOCK_MIN_SIZE: number;
export const FLOCK_MAX_SIZE: number;
export const EMPTY_COMBO: ComboState;

export function formatElapsed(ms: number): string;
export function digLevel(elapsedMs: number): number;
export function levelProgress(elapsedMs: number): number;
export function pileRemaining(elapsedMs: number): number;
export function comboAt(state: ComboState, now: number): number;
export function registerTap(state: ComboState, now: number): ComboState;
export function cheerFor(combo: number): string | null;
export function flockSize(level: number): number;
export function createRandom(seed: number): () => number;

export const HERO_FRAME_COUNT: number;
export const THROW_FRAME: number;
export const HERO_CYCLE_MS: number;
export const HERO_FRAME_STARTS: ReadonlyArray<number>;
export const QUICK_THROW_MS: number;
export const QUICK_FRAME_STARTS: ReadonlyArray<number>;
export function heroFrameIndex(options: { now: number; quickStartedAt: number; isReduced: boolean }): number;
export function frameRect(
  index: number,
  frameWidth: number,
  frameHeight: number,
): { sx: number; sy: number; sw: number; sh: number };
export function fitToHeight(width: number, height: number, targetHeight: number): { width: number; height: number };
export function moundSize(
  remaining: number,
  range: { minHalfWidth: number; maxHalfWidth: number; minHeight: number; maxHeight: number },
): { halfWidth: number; height: number };
