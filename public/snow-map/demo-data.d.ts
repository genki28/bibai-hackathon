// demo-data.js の型(TypeScript のテストから使うため)。
export type DemoPile = {
  readonly id: string;
  readonly lat: number;
  readonly lng: number;
  readonly area: string;
  readonly finishedAt: string;
  readonly members: ReadonlyArray<{ readonly displayName: string; readonly calories: number }>;
  readonly totalCalories: number;
};
export function createDemoMap(options?: { count?: number; seed?: number; now?: number }): {
  piles: DemoPile[];
  totals: { piles: number; people: number; calories: number };
  isDemo: true;
};
