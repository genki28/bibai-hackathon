import type { Role } from "./roles.js";

/**
 * 「誰がどの役割か」を覚えておく場所。
 * いまはサーバーのメモリに置いているので、再起動すると消える(Supabase につなぐときに置き換える)。
 * ただし LINE 側に紐付けたリッチメニューは残るので、利用者の見た目は変わらない。
 */
export type RoleStore = {
  readonly getRole: (userId: string) => Role | null;
  readonly setRole: (userId: string, role: Role) => void;
  /** 登録を取り消す(メニューを最初に戻すとき)。 */
  readonly clearRole: (userId: string) => void;
};

export function createRoleStore(): RoleStore {
  let roles: ReadonlyMap<string, Role> = new Map();

  return {
    getRole: (userId) => roles.get(userId) ?? null,
    setRole: (userId, role) => {
      roles = new Map([...roles, [userId, role]]);
    },
    clearRole: (userId) => {
      roles = new Map([...roles].filter(([id]) => id !== userId));
    },
  };
}
