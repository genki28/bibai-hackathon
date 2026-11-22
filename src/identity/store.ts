/**
 * 本人確認(マイナンバーカード)の「結果」を覚えておく場所。
 *
 * ⚠ これはデモ用の仮実装(モック)です。実際のカード読み取りや本人確認はしていません。
 * 本番では、国の認定を受けた本人確認サービスの結果をここに保存する想定です。
 * マイナンバー(12 桁の番号)そのものは、本番でも保存しません。
 *
 * 保存先は 2 種類: メモリ版(このファイル。テストや Supabase 未設定のとき用。再起動で消える)と
 * Supabase 版(supabase-store.ts)。
 */

const USER_ID_PATTERN = /^U[0-9a-f]{32}$/;

export type VerificationMethod = "mynumber-card-mock";

export type IdentityStatus = {
  readonly verified: boolean;
  readonly verifiedAt: string | null;
  readonly method: VerificationMethod | null;
};

export type IdentityStore = {
  readonly getStatus: (userId: string) => Promise<IdentityStatus>;
  readonly markVerified: (userId: string, now: Date) => Promise<IdentityStatus>;
};

export const NOT_VERIFIED: IdentityStatus = {
  verified: false,
  verifiedAt: null,
  method: null,
};

/** LINE のユーザー ID の形(U + 英数字 32 文字)かどうか。 */
export function isValidUserId(value: unknown): value is string {
  return typeof value === "string" && USER_ID_PATTERN.test(value);
}

/** 確認済みの状態を作る。 */
export function verifiedStatus(now: Date): IdentityStatus {
  return { verified: true, verifiedAt: now.toISOString(), method: "mynumber-card-mock" };
}

/** メモリ版。 */
export function createIdentityStore(): IdentityStore {
  let records: ReadonlyMap<string, IdentityStatus> = new Map();

  return {
    getStatus: async (userId) => records.get(userId) ?? NOT_VERIFIED,
    markVerified: async (userId, now) => {
      const status = verifiedStatus(now);
      records = new Map([...records, [userId, status]]);
      return status;
    },
  };
}
