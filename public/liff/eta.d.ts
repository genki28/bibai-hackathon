// eta.js の型(TypeScript のテストから使うため)。
import type { LatLng } from "./geo.js";

export const WALKING_SPEED_KMH: number;
export function distanceM(a: LatLng, b: LatLng): number;
export function etaMinutes(meters: number): number;
export function minutesAgo(at: string, now: Date): number;
export function locationAgeText(at: string, now: Date): string;
export type HelperProgress =
  | { kind: "arrived" }
  | { kind: "no-location" }
  | { kind: "sharing"; minutes: number | null; ageText: string };
export function helperProgress(
  helper: { arrivedAt: string | null; location?: LatLng & { at: string } },
  home: LatLng | null,
  now: Date,
): HelperProgress;
export function stepToward(from: LatLng, to: LatLng, stepM: number): LatLng;
