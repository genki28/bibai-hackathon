// snow-mountain.js の型(TypeScript のテストから使うため)。
export type Member = { readonly displayName: string; readonly calories: number };
export type MountainFeature = {
  readonly type: "Feature";
  readonly geometry: { readonly type: "Polygon"; readonly coordinates: ReadonlyArray<ReadonlyArray<[number, number]>> };
  readonly properties: {
    readonly id: string;
    readonly step: number;
    readonly base: number;
    readonly height: number;
    readonly member: string;
    readonly memberIndex: number;
  };
};
export const STEPS: number;
export const METERS_PER_KCAL: number;
export function ringAround(center: { readonly lat: number; readonly lng: number }, radiusM: number, sides?: number): Array<[number, number]>;
export function mountainFeatures(
  pile: { readonly id: string; readonly lat: number; readonly lng: number; readonly members: ReadonlyArray<Member> },
  progress: number,
  scale?: number,
): MountainFeature[];
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
