/**
 * 「誰がどの役割か」の保存先の Supabase 版。表は user_roles。
 */
import { throwIfError } from "../supabase.js";
import type { SupabaseClient } from "../supabase.js";
import { isRole } from "./roles.js";
import type { Role } from "./roles.js";
import type { RoleStore } from "./store.js";

const TABLE = "user_roles";

/** 表の行 → 役割(純粋関数)。行がない・知らない値なら null。 */
export function toRole(row: Readonly<Record<string, unknown>> | null): Role | null {
  return row && isRole(row.role) ? row.role : null;
}

export function createSupabaseRoleStore(client: SupabaseClient): RoleStore {
  return {
    getRole: async (userId) => {
      const { data, error } = await client
        .from(TABLE)
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();
      throwIfError(error, "役割を読む");
      return toRole(data);
    },
    setRole: async (userId, role) => {
      const { error } = await client
        .from(TABLE)
        .upsert({ user_id: userId, role, updated_at: new Date().toISOString() });
      throwIfError(error, "役割を保存する");
    },
    clearRole: async (userId) => {
      const { error } = await client.from(TABLE).delete().eq("user_id", userId);
      throwIfError(error, "役割を消す");
    },
  };
}
