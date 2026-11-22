/**
 * 本人確認(マイナンバーカード)の「結果」を覚えておく場所。
 *
 * ⚠ これはデモ用の仮実装(モック)です。実際のカード読み取りや本人確認はしていません。
 * 本番では、国の認定を受けた本人確認サービスの結果をここに保存する想定です。
 * マイナンバー(12 桁の番号)そのものは、本番でも保存しません。
 *
 * いまはサーバーのメモリに置いているので、サーバーを再起動すると消えます
 * (Supabase につなぐときに置き換える)。
 */

const USER_ID_PATTERN = /^U[0-9a-f]{32}$/;

export type VerificationMethod = "mynumber-card-mock";

export type IdentityStatus = {
  readonly verified: boolean;
  readonly verifiedAt: string | null;
  readonly method: VerificationMethod | null;
};

export type IdentityStore = {
  readonly getStatus: (userId: string) => IdentityStatus;
  readonly markVerified: (userId: string, now: Date) => IdentityStatus;
};

const NOT_VERIFIED: IdentityStatus = {
  verified: false,
  verifiedAt: null,
  method: null,
};

/** LINE のユーザー ID の形(U + 英数字 32 文字)かどうか。 */
export function isValidUserId(value: unknown): value is string {
  return typeof value === "string" && USER_ID_PATTERN.test(value);
}

export function createIdentityStore(): IdentityStore {
  let records: ReadonlyMap<string, IdentityStatus> = new Map();

  return {
    getStatus: (userId) => records.get(userId) ?? NOT_VERIFIED,
    markVerified: (userId, now) => {
      const status: IdentityStatus = {
        verified: true,
        verifiedAt: now.toISOString(),
        method: "mynumber-card-mock",
      };
      records = new Map([...records, [userId, status]]);
      return status;
    },
  };
}
