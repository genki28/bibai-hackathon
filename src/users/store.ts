import type { Role } from "./roles.js";

/**
 * 「誰がどの役割か」を覚えておく場所。
 * 保存先は 2 種類: メモリ版(このファイル。テストや Supabase 未設定のとき用。再起動で消える)と
 * Supabase 版(supabase-store.ts)。
 * リッチメニューの紐付けはこことは別に LINE 側に保存される。
 */
export type RoleStore = {
  readonly getRole: (userId: string) => Promise<Role | null>;
  readonly setRole: (userId: string, role: Role) => Promise<void>;
  /** 登録を取り消す(メニューを最初に戻すとき)。 */
  readonly clearRole: (userId: string) => Promise<void>;
};

/** メモリ版。 */
export function createRoleStore(): RoleStore {
  let roles: ReadonlyMap<string, Role> = new Map();

  return {
    getRole: async (userId) => roles.get(userId) ?? null,
    setRole: async (userId, role) => {
      roles = new Map([...roles, [userId, role]]);
    },
    clearRole: async (userId) => {
      roles = new Map([...roles].filter(([id]) => id !== userId));
    },
  };
}
