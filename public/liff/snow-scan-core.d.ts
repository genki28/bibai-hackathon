// snow-scan-core.js の型(TypeScript のテストから使うため)。
export type RgbaImage = { readonly data: Uint8ClampedArray; readonly width: number; readonly height: number };

export const GROUND_TOP: number;
export const NOT_GROUND: number;
export function isSnowColor(r: number, g: number, b: number, reference: number): boolean;
export function snowMaskOf(image: RgbaImage): Uint8Array;
export function footprintWeights(depth: ArrayLike<number>, mask?: Uint8Array | null): Float32Array;
export function snowCoverage(mask: Uint8Array, weights?: ArrayLike<number> | null): number;
export function clearanceRate(before: number, after: number): number;
