// snow-mountain.js の型(TypeScript のテストから使うため)。
export type Member = { readonly displayName: string; readonly calories: number };
export const METERS_PER_KCAL: number;
export function mountainSize(pile: { readonly members: ReadonlyArray<{ readonly calories: number }> }, scale?: number): { heightM: number; radiusM: number };
export function seedFromId(id: string): number;
export function seededUnit(seed: number, index: number): number;
export function snowNoise(seed: number, angle: number, u: number): number;
export function mountainProfile(u: number): number;
export function growProgress(elapsedMs: number, index: number, growMs: number, staggerMs: number): number;
export function toLocalMeters(
  origin: { readonly lat: number; readonly lng: number },
  point: { readonly lat: number; readonly lng: number },
): { x: number; y: number };
type ScreenPoint = { readonly x: number; readonly y: number };
export function pickMountain<T>(
  point: ScreenPoint,
  candidates: ReadonlyArray<{ readonly item: T; readonly base: ScreenPoint; readonly peak: ScreenPoint; readonly radiusPx: number }>,
  minPx?: number,
): T | null;
export type Pile = {
  readonly id: string;
  readonly lat: number;
  readonly lng: number;
  readonly area: string;
  readonly finishedAt: string;
  readonly members: ReadonlyArray<Member>;
  readonly totalCalories: number;
};
export function clusterPiles(piles: ReadonlyArray<Pile>, zoom: number): Array<Pile & { readonly count: number; readonly pileIds: string[] }>;
