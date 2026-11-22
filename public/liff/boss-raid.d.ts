// boss-raid.js の型(TypeScript のテストから使うため)。
export type RaidPoint = { readonly mine: number; readonly team: number; readonly maxHp: number };
export type BossView = { readonly hp: number; readonly maxHp: number; readonly ratio: number; readonly isDefeated: boolean };
export type Announcement = { readonly kind: "defeat" | "boss" | "team" | "mine"; readonly text: string };

export const BOSS_HP_PER_HELPER: Readonly<Record<"little" | "normal" | "lots", number>>;
export const MINE_STEP: number;
export const TEAM_STEP: number;
export function bossMaxHp(amount: string, helperCount: number): number;
export function teamScoops(
  helpers: ReadonlyArray<{ readonly userId: string; readonly scoops?: number }>,
  myUserId: string,
  myCount: number,
): number;
export function bossView(total: number, maxHp: number): BossView;
export function announcementFor(prev: RaidPoint, next: RaidPoint): Announcement | null;
