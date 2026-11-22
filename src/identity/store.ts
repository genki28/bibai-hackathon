/**
 * 本人確認の「結果」を覚えておく場所。
 *
 * ⚠ これはデモ用の仮実装です。保存するのは「確認できたか・どの方式か・生きた本人かの確認をしたか」だけ。
 * 身分証や顔の画像、顔の特徴の数値、マイナンバー(12 桁の番号)は保存しません。
 * 本番では、国の認定を受けた本人確認サービス(eKYC)の結果をここに保存する想定です。
 *
 * 方式(method):
 * - mynumber-card-mock … カードを「かざした」ことにするだけのデモ(予備のボタン)
 * - face-match-demo    … 身分証の顔写真と自撮りを、スマホの中だけで照合するデモ
 *
 * 保存先は 2 種類: メモリ版(このファイル。テストや Supabase 未設定のとき用。再起動で消える)と
 * Supabase 版(supabase-store.ts)。
 */

const USER_ID_PATTERN = /^U[0-9a-f]{32}$/;

/** 受け付ける確認の方式。ここにない値はサーバーで断る。 */
export const VERIFICATION_METHODS = ["mynumber-card-mock", "face-match-demo"] as const;

export type VerificationMethod = (typeof VERIFICATION_METHODS)[number];

export type IdentityStatus = {
  readonly verified: boolean;
  readonly verifiedAt: string | null;
  readonly method: VerificationMethod | null;
  /** 生きた本人かの確認(まばたき・顔の向き)をしたか。未確認なら null。 */
  readonly liveness: boolean | null;
};

/** 確認の結果として保存する中身。 */
export type VerificationResult = {
  readonly method: VerificationMethod;
  readonly liveness: boolean;
};

export type IdentityStore = {
  readonly getStatus: (userId: string) => Promise<IdentityStatus>;
  /** 確認済みにする。result を省くと、カードのデモ(mynumber-card-mock・ライブネスなし)として保存する。 */
  readonly markVerified: (
    userId: string,
    now: Date,
    result?: VerificationResult,
  ) => Promise<IdentityStatus>;
  /** 確認の結果を消す(テスト用のデータを消すとき用)。 */
  readonly remove: (userId: string) => Promise<void>;
};

export const NOT_VERIFIED: IdentityStatus = {
  verified: false,
  verifiedAt: null,
  method: null,
  liveness: null,
};

/** カードの「かざした(デモ)」の結果。 */
export const MOCK_CARD_RESULT: VerificationResult = {
  method: "mynumber-card-mock",
  liveness: false,
};

/** LINE のユーザー ID の形(U + 英数字 32 文字)かどうか。 */
export function isValidUserId(value: unknown): value is string {
  return typeof value === "string" && USER_ID_PATTERN.test(value);
}

/** 受け付ける確認の方式かどうか。 */
export function isVerificationMethod(value: unknown): value is VerificationMethod {
  return typeof value === "string" && (VERIFICATION_METHODS as readonly string[]).includes(value);
}

/** 確認済みの状態を作る。 */
export function verifiedStatus(
  now: Date,
  result: VerificationResult = MOCK_CARD_RESULT,
): IdentityStatus {
  return {
    verified: true,
    verifiedAt: now.toISOString(),
    method: result.method,
    liveness: result.liveness,
  };
}

/** メモリ版。 */
export function createIdentityStore(): IdentityStore {
  let records: ReadonlyMap<string, IdentityStatus> = new Map();

  return {
    getStatus: async (userId) => records.get(userId) ?? NOT_VERIFIED,
    markVerified: async (userId, now, result) => {
      const status = verifiedStatus(now, result);
      records = new Map([...records, [userId, status]]);
      return status;
    },
    remove: async (userId) => {
      records = new Map([...records].filter(([id]) => id !== userId));
    },
  };
}
