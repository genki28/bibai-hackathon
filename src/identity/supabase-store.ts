/**
 * 本人確認(デモ)の結果の保存先の Supabase 版。表は identity_verifications。
 * 行があれば確認済み、なければ未確認。
 */
import { throwIfError } from "../supabase.js";
import type { SupabaseClient } from "../supabase.js";
import { NOT_VERIFIED, verifiedStatus } from "./store.js";
import type { IdentityStatus, IdentityStore } from "./store.js";

const TABLE = "identity_verifications";

/** 表の行 → 確認の状態(純粋関数)。行がなければ未確認。 */
export function toIdentityStatus(row: Readonly<Record<string, unknown>> | null): IdentityStatus {
  if (!row || typeof row.verified_at !== "string") return NOT_VERIFIED;
  return verifiedStatus(new Date(row.verified_at));
}

export function createSupabaseIdentityStore(client: SupabaseClient): IdentityStore {
  return {
    getStatus: async (userId) => {
      const { data, error } = await client
        .from(TABLE)
        .select("verified_at")
        .eq("user_id", userId)
        .maybeSingle();
      throwIfError(error, "本人確認の結果を読む");
      return toIdentityStatus(data);
    },
    markVerified: async (userId, now) => {
      const status = verifiedStatus(now);
      const { error } = await client
        .from(TABLE)
        .upsert({ user_id: userId, verified_at: status.verifiedAt, method: status.method });
      throwIfError(error, "本人確認の結果を保存する");
      return status;
    },
  };
}
