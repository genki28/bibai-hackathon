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
