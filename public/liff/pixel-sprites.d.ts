// pixel-sprites.js の型(TypeScript のテストから使うため)。
export type Sprite = ReadonlyArray<string>;
export type Palette = Readonly<Record<string, string>>;

export const PALETTE: Palette;
export const TRANSPARENT: string;
export const HERO_FRAMES: Readonly<{ dig: Sprite; lift: Sprite; throw: Sprite }>;
export const GOOSE_FRAMES: Readonly<{ up: Sprite; down: Sprite }>;
export const FONT_PALETTE: Palette;
export const FONT_WIDTH: number;
export const FONT_HEIGHT: number;
export const FONT: Readonly<Record<string, Sprite>>;

export function validateSprite(rows: unknown, palette: Palette): string[];
export function spriteSize(rows: Sprite): { width: number; height: number };
export function textWidth(text: string, scale?: number): number;
export function toFontText(text: string): string;
