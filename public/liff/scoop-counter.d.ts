// scoop-counter.js の型(TypeScript のテストから使うため)。
export type ScoopSample = {
  readonly t: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly includesGravity?: boolean;
};
export type ScoopState = {
  readonly count: number;
  readonly lastT: number | null;
  readonly gravity: { readonly x: number; readonly y: number; readonly z: number } | null;
  readonly recent: ReadonlyArray<number>;
  readonly isAbove: boolean;
  readonly lastCountAt: number | null;
};

export const KG_PER_SCOOP: number;
export const SCOOP_THRESHOLD: number;
export const RELEASE_THRESHOLD: number;
export const MIN_SCOOP_INTERVAL_MS: number;
export const SMOOTHING_SAMPLES: number;
export const GRAVITY_TIME_CONSTANT_MS: number;
export const GAP_RESET_MS: number;
export const EMPTY_SCOOP_STATE: ScoopState;

export function scoopStateFrom(count: number): ScoopState;
export function stepScoop(state: ScoopState, sample: ScoopSample): ScoopState;
export function countScoops(samples: ReadonlyArray<ScoopSample>, state?: ScoopState): number;
export function scoopKg(count: number): number;
