// geo.js の型(TypeScript のテストから使うため)。
export interface LatLng {
  lat: number;
  lng: number;
}
export function polygonAreaM2(points: ReadonlyArray<LatLng>): number;
export function squareAround(center: LatLng, sizeM: number): LatLng[];
export function midpoint(a: LatLng, b: LatLng): LatLng;
export function edgeMidpoints(points: ReadonlyArray<LatLng>): Array<{ insertAt: number; point: LatLng }>;
export function insertPointAt(points: ReadonlyArray<LatLng>, index: number, point: LatLng): LatLng[];
export function movePointAt(points: ReadonlyArray<LatLng>, index: number, point: LatLng): LatLng[];
export function removePointAt(points: ReadonlyArray<LatLng>, index: number): LatLng[];
