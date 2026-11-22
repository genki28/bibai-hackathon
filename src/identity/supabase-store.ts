/**
 * 本人確認(デモ)の結果の保存先の Supabase 版。表は identity_verifications。
 * 行があれば確認済み、なければ未確認。
 * liveness 列は supabase/migrations/0003_identity_face.sql で足す。
 */
import { throwIfError } from "../supabase.js";
import type { SupabaseClient } from "../supabase.js";
import { MOCK_CARD_RESULT, NOT_VERIFIED, isVerificationMethod, verifiedStatus } from "./store.js";
import type { IdentityStatus, IdentityStore } from "./store.js";

const TABLE = "identity_verifications";

/**
 * 表の行 → 確認の状態(純粋関数)。行がなければ未確認。
 * 古い行(method・liveness がない、または知らない値)は、カードのデモ・ライブネスなしとして扱う。
 */
export function toIdentityStatus(row: Readonly<Record<string, unknown>> | null): IdentityStatus {
  if (!row || typeof row.verified_at !== "string") return NOT_VERIFIED;
  const method = isVerificationMethod(row.method) ? row.method : MOCK_CARD_RESULT.method;
  const liveness = row.liveness === true;
  return verifiedStatus(new Date(row.verified_at), { method, liveness });
}

export function createSupabaseIdentityStore(client: SupabaseClient): IdentityStore {
  return {
    getStatus: async (userId) => {
      // "*" にしておくと、0003 の SQL を実行する前(liveness 列がない)でも読める
      const { data, error } = await client
        .from(TABLE)
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      throwIfError(error, "本人確認の結果を読む");
      return toIdentityStatus(data);
    },
    markVerified: async (userId, now, result) => {
      const status = verifiedStatus(now, result);
      const { error } = await client.from(TABLE).upsert({
        user_id: userId,
        verified_at: status.verifiedAt,
        method: status.method,
        liveness: status.liveness,
      });
      throwIfError(error, "本人確認の結果を保存する");
      return status;
    },
    remove: async (userId) => {
      const { error } = await client.from(TABLE).delete().eq("user_id", userId);
      throwIfError(error, "本人確認の結果を消す");
    },
  };
}
