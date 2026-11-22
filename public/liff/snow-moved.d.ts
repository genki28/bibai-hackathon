// snow-moved.js の型(TypeScript のテストから使うため)。
export type MovedPoint = { readonly mine: number; readonly team: number };
export type Comparison = { readonly kg: number; readonly label: string };
export type Announcement = { readonly kind: "milestone" | "team" | "mine"; readonly text: string };

export const MINE_STEP: number;
export const TEAM_STEP: number;
export const COMPARISONS: ReadonlyArray<Comparison>;
export function teamScoops(
  helpers: ReadonlyArray<{ readonly userId: string; readonly scoops?: number }>,
  myUserId: string,
  myCount: number,
): number;
export function comparisonFor(kg: number): Comparison | null;
export function announcementFor(prev: MovedPoint, next: MovedPoint): Announcement | null;
