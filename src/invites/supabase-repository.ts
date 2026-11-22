/**
 * 招待の保存の窓口(repository.ts)の Supabase 版。
 * 表は invite_codes(招待コード)と referrals(だれがだれに誘われたか)。
 * 表の作り方は supabase/migrations/0002_leader_and_points.sql。
 */
import { normalizeTimestamp } from "../help-requests/rows.js";
import { throwIfError, UNIQUE_VIOLATION } from "../supabase.js";
import type { SupabaseClient } from "../supabase.js";
import type { InviteCode, Referral } from "./model.js";
import type { InviteRepository } from "./repository.js";

const CODES = "invite_codes";
const REFERRALS = "referrals";

type RawRow = Readonly<Record<string, unknown>>;

const text = (value: unknown): string => (typeof value === "string" ? value : "");

/** 表の行 → 招待コード(純粋関数)。 */
export function toInviteCode(row: RawRow): InviteCode {
  return {
    userId: text(row.user_id),
    code: text(row.code),
    createdAt: normalizeTimestamp(row.created_at) ?? "",
  };
}

/** 表の行 → 招待の記録(純粋関数)。 */
export function toReferral(row: RawRow): Referral {
  return {
    inviteeUserId: text(row.invitee_user_id),
    inviterUserId: text(row.inviter_user_id),
    createdAt: normalizeTimestamp(row.created_at) ?? "",
  };
}

export function createSupabaseInviteRepository(client: SupabaseClient): InviteRepository {
  const findCode = async (column: "user_id" | "code", value: string): Promise<InviteCode | null> => {
    const { data, error } = await client.from(CODES).select("*").eq(column, value).maybeSingle();
    throwIfError(error, "招待コードを読む");
    return data ? toInviteCode(data) : null;
  };

  const deleteWhereIn = async (table: string, column: string, userIds: readonly string[]): Promise<number> => {
    const { data, error } = await client.from(table).delete().in(column, [...userIds]).select(column);
    throwIfError(error, `${table} を消す`);
    return (data ?? []).length;
  };

  return {
    findCodeByUser: (userId) => findCode("user_id", userId),
    findCodeByCode: (code) => findCode("code", code),
    insertCode: async (invite) => {
      const { error } = await client
        .from(CODES)
        .insert({ user_id: invite.userId, code: invite.code, created_at: invite.createdAt });
      if (error?.code === UNIQUE_VIOLATION) return false;
      throwIfError(error, "招待コードを保存する");
      return true;
    },
    findReferral: async (inviteeUserId) => {
      const { data, error } = await client
        .from(REFERRALS)
        .select("*")
        .eq("invitee_user_id", inviteeUserId)
        .maybeSingle();
      throwIfError(error, "招待の記録を読む");
      return data ? toReferral(data) : null;
    },
    insertReferral: async (referral) => {
      const { error } = await client.from(REFERRALS).insert({
        invitee_user_id: referral.inviteeUserId,
        inviter_user_id: referral.inviterUserId,
        created_at: referral.createdAt,
      });
      if (error?.code === UNIQUE_VIOLATION) return false;
      throwIfError(error, "招待の記録を保存する");
      return true;
    },
    listReferrals: async () => {
      const { data, error } = await client.from(REFERRALS).select("*");
      throwIfError(error, "招待の記録の一覧を読む");
      return (data ?? []).map(toReferral);
    },
    deleteInvolving: async (userIds) => {
      if (userIds.length === 0) return 0;
      // 同じ行を 2 回数えないように、1 つずつ順に消す
      const codes = await deleteWhereIn(CODES, "user_id", userIds);
      const asInvitee = await deleteWhereIn(REFERRALS, "invitee_user_id", userIds);
      const asInviter = await deleteWhereIn(REFERRALS, "inviter_user_id", userIds);
      return codes + asInvitee + asInviter;
    },
  };
}
