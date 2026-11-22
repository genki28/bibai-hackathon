/**
 * 招待コードと招待の記録の「保存の窓口」。
 * 中身は 2 種類: メモリ版(このファイル。テストや Supabase 未設定のとき用)と
 * Supabase 版(supabase-repository.ts。表は invite_codes と referrals)。
 */
import type { InviteCode, Referral } from "./model.js";

export type InviteRepository = {
  readonly findCodeByUser: (userId: string) => Promise<InviteCode | null>;
  readonly findCodeByCode: (code: string) => Promise<InviteCode | null>;
  /** 新しく保存する。同じ人のコードか同じコードがすでにあれば false。 */
  readonly insertCode: (invite: InviteCode) => Promise<boolean>;
  readonly findReferral: (inviteeUserId: string) => Promise<Referral | null>;
  /** 新しく保存する。その人の記録がすでにあれば false(1 人 1 回だけ)。 */
  readonly insertReferral: (referral: Referral) => Promise<boolean>;
  readonly listReferrals: () => Promise<readonly Referral[]>;
  /** userIds のだれかの招待コードと、だれかが誘った・誘われた記録を消して、消した件数を返す(テスト用)。 */
  readonly deleteInvolving: (userIds: readonly string[]) => Promise<number>;
};

/** メモリ版。サーバーを再起動すると消える。 */
export function createMemoryInviteRepository(): InviteRepository {
  let codes: readonly InviteCode[] = [];
  let referrals: readonly Referral[] = [];

  return {
    findCodeByUser: async (userId) => codes.find((c) => c.userId === userId) ?? null,
    findCodeByCode: async (code) => codes.find((c) => c.code === code) ?? null,
    insertCode: async (invite) => {
      if (codes.some((c) => c.userId === invite.userId || c.code === invite.code)) return false;
      codes = [...codes, invite];
      return true;
    },
    findReferral: async (inviteeUserId) =>
      referrals.find((r) => r.inviteeUserId === inviteeUserId) ?? null,
    insertReferral: async (referral) => {
      if (referrals.some((r) => r.inviteeUserId === referral.inviteeUserId)) return false;
      referrals = [...referrals, referral];
      return true;
    },
    listReferrals: async () => referrals,
    deleteInvolving: async (userIds) => {
      const keptCodes = codes.filter((c) => !userIds.includes(c.userId));
      const keptReferrals = referrals.filter(
        (r) => !userIds.includes(r.inviteeUserId) && !userIds.includes(r.inviterUserId),
      );
      const deleted = codes.length - keptCodes.length + (referrals.length - keptReferrals.length);
      codes = keptCodes;
      referrals = keptReferrals;
      return deleted;
    },
  };
}
