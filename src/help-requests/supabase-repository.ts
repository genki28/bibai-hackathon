/**
 * 依頼の保存の窓口(repository.ts)の Supabase 版。表は help_requests。
 * 書き換えは「id と version が一致する行だけ」を更新する(楽観ロック)。
 */
import { throwIfError, UNIQUE_VIOLATION } from "../supabase.js";
import type { SupabaseClient } from "../supabase.js";
import type { HelpRequestRepository } from "./repository.js";
import { fromRow, fromVersionedRow, toRow } from "./rows.js";

const TABLE = "help_requests";

export function createSupabaseHelpRequestRepository(client: SupabaseClient): HelpRequestRepository {
  const table = () => client.from(TABLE);

  return {
    findById: async (id) => {
      const { data, error } = await table().select("*").eq("id", id).maybeSingle();
      throwIfError(error, "依頼を読む");
      return data ? fromVersionedRow(data) : null;
    },
    listByUser: async (userId) => {
      const { data, error } = await table()
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });
      throwIfError(error, "その人の依頼を読む");
      return (data ?? []).map(fromRow);
    },
    listByStatus: async (statuses) => {
      const { data, error } = await table()
        .select("*")
        .in("status", [...statuses])
        .order("created_at", { ascending: true });
      throwIfError(error, "依頼の一覧を読む");
      return (data ?? []).map(fromRow);
    },
    insert: async (request) => {
      const { error } = await table().insert({ ...toRow(request), version: 0 });
      // 同じ人のまだ終わっていない依頼がすでにある(同時に 2 回送られたなど)
      if (error?.code === UNIQUE_VIOLATION) return false;
      throwIfError(error, "依頼を保存する");
      return true;
    },
    update: async (request, expectedVersion) => {
      const { data, error } = await table()
        .update({
          ...toRow(request),
          version: expectedVersion + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", request.id)
        .eq("version", expectedVersion)
        .select("id");
      throwIfError(error, "依頼を書き換える");
      // 1 行も更新されなければ、ほかの人が先に書き換えていた
      return (data ?? []).length === 1;
    },
  };
}
