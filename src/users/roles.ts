/** 使う人の役割。elder = 助けてほしい人(お年寄り)、helper = 助けたい人(若者)。 */
export type Role = "elder" | "helper";

export const ROLES: readonly Role[] = ["elder", "helper"];

/** 画面やメッセージに出す呼び方。 */
export const ROLE_LABELS: Readonly<Record<Role, string>> = {
  elder: "助けてほしい",
  helper: "助けたい",
};

/**
 * リッチメニューの名前。LINE に登録したメニューを名前で探すので、
 * scripts/create-rich-menu.ts と同じ名前を使う(ここが正)。
 */
export const MENU_NAMES = {
  registration: "利用者登録メニュー",
  elder: "助けてほしい人のメニュー",
  helper: "助けたい人のメニュー",
} as const satisfies Readonly<Record<"registration" | Role, string>>;

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}
