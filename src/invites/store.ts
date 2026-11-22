/**
 * 招待(友だちを誘う)を覚えておく場所。保存先(メモリ / Supabase)は repository.ts の窓口で差し替える。
 * 決まりごと(記録するかどうか)は model.ts の decideReferral。ここはそれをつなぐだけ。
 */
import { decideReferral, generateInviteCode } from "./model.js";
import type { InviteCode, Referral, ReferralSkipReason } from "./model.js";
import { createMemoryInviteRepository } from "./repository.js";
import type { InviteRepository } from "./repository.js";

export type AcceptResult =
  | { readonly accepted: true; readonly inviterUserId: string }
  | { readonly accepted: false; readonly reason: ReferralSkipReason };

export type InviteStore = {
  /** その人の招待コード。まだなければ作って保存する。 */
  readonly getOrCreateCode: (userId: string, now: Date) => Promise<InviteCode>;
  /** 招待リンクで開いた人を「誘われた人」として 1 回だけ記録する。記録しなかったときは理由を返す。 */
  readonly accept: (inviteeUserId: string, code: string, now: Date) => Promise<AcceptResult>;
  readonly listReferrals: () => Promise<readonly Referral[]>;
  /** テスト用の利用者の招待コード・招待の記録を消す。消した件数を返す。 */
  readonly deleteInvolving: (userIds: readonly string[]) => Promise<number>;
};

/** コードがぶつかったときに作り直す回数。 */
const MAX_ATTEMPTS = 3;

export type InviteStoreOptions = {
  /** 招待コードの作り方(テストで差し替える)。 */
  readonly generateCode?: () => string;
};

export function createInviteStore(
  repo: InviteRepository = createMemoryInviteRepository(),
  options: InviteStoreOptions = {},
): InviteStore {
  const generateCode = options.generateCode ?? generateInviteCode;

  const getOrCreateCode = async (userId: string, now: Date): Promise<InviteCode> => {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const existing = await repo.findCodeByUser(userId);
      if (existing) return existing;
      const created: InviteCode = { userId, code: generateCode(), createdAt: now.toISOString() };
      if (await repo.insertCode(created)) return created;
      // 同じ人が同時に作った、またはたまたま同じコードだった → 読み直して作り直す
    }
    throw new Error("招待コードを作れませんでした。もう一度お試しください。");
  };

  const accept = async (inviteeUserId: string, code: string, now: Date): Promise<AcceptResult> => {
    const [owner, existing] = await Promise.all([repo.findCodeByCode(code), repo.findReferral(inviteeUserId)]);
    const decision = decideReferral({
      inviteeUserId,
      inviterUserId: owner?.userId ?? null,
      existing,
      now,
    });
    if (!decision.ok) return { accepted: false, reason: decision.reason };
    // 同時に 2 回送られて、もう片方が先に記録した
    if (!(await repo.insertReferral(decision.referral))) return { accepted: false, reason: "already-recorded" };
    return { accepted: true, inviterUserId: decision.referral.inviterUserId };
  };

  return {
    getOrCreateCode,
    accept,
    listReferrals: () => repo.listReferrals(),
    deleteInvolving: (userIds) => repo.deleteInvolving(userIds),
  };
}
