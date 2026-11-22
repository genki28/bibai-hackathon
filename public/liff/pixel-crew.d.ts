// pixel-crew.js の型(TypeScript のテストから使うため)。
export type CrewSide = "left" | "right";
export type CrewSlot = { side: CrewSide; rank: number; isFlipped: boolean };
export type CrewPlacement = CrewSlot & {
  index: number;
  width: number;
  height: number;
  left: number;
  top: number;
  bodyX: number;
  feetY: number;
};

export const MAX_CREW: number;
export const HEIGHT_RATIO_BY_COUNT: ReadonlyArray<number>;
export const DEPTH_SCALE_STEP: number;
export const DEPTH_RISE: number;
export const INNER_GAP_RATIO: number;
export const SPACING_RATIO: number;
export const BODY_ANCHOR: number;
export const FRAME_OFFSET_STEP_MS: number;
export const NAME_MAX_LENGTH: number;

export function crewSlot(index: number): CrewSlot;
export function crewLayout(
  count: number,
  scene: { sceneHeight: number; centerX: number; feetY: number; frameAspect: number },
): CrewPlacement[];
export function crewFrameOffset(index: number, cycleMs: number): number;
export function shortName(name: string | null | undefined, maxLength?: number): string;
export function lerp(a: number, b: number, t: number): number;
export function easeOut(t: number): number;
