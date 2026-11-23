// brush-area-core.js の型(TypeScript のテストから使うため)。
export type LocalPoint = { readonly x: number; readonly y: number };
export type Stroke = { readonly widthM: number; readonly points: ReadonlyArray<LocalPoint> };

export const CELL_M: number;
export function toLocalMeters(
  point: { readonly lat: number; readonly lng: number },
  origin: { readonly lat: number; readonly lng: number },
): LocalPoint;
export function paintedAreaM2(strokes: ReadonlyArray<Stroke>): number;
