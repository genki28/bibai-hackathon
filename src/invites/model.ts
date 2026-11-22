/**
 * 招待(友だちを誘う)の「形」と、決まりごと(純粋関数)。
 * - 招待コード: ユーザーごとのランダムな文字列。LINE のユーザー ID をそのままリンクに入れない
 *   (ID が知られると、ほかの人のふりをして API を呼ぶのに使えてしまうため)
 * - 招待の記録(Referral): 「だれ(invitee)が、だれ(inviter)に誘われたか」。1 人 1 回だけ
 */
import { randomBytes } from "node:crypto";

/** 招待コードに使う文字(見まちがえやすい 0 / o / 1 / l / i は使わない)。 */
const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
/** 招待コードの長さ。31 文字 × 10 桁 ≒ 8 × 10^14 通りなので、当てずっぽうでは当たらない。 */
export const INVITE_CODE_LENGTH = 10;
const CODE_PATTERN = new RegExp(`^[${CODE_ALPHABET}]{${INVITE_CODE_LENGTH}}$`);

export type InviteCode = {
  readonly userId: string;
  readonly code: string;
  readonly createdAt: string;
};

export type Referral = {
  /** 誘われた人。 */
  readonly inviteeUserId: string;
  /** 誘った人。 */
  readonly inviterUserId: string;
  readonly createdAt: string;
};

export const isValidInviteCode = (value: unknown): value is string =>
  typeof value === "string" && CODE_PATTERN.test(value);

/** バイト列から招待コードを作る(テストで同じ結果にできるように、バイトを外から渡せる)。 */
export function inviteCodeFromBytes(bytes: Uint8Array): string {
  return Array.from(bytes.slice(0, INVITE_CODE_LENGTH), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

/** ランダムな招待コードを作る。 */
export const generateInviteCode = (): string => inviteCodeFromBytes(randomBytes(INVITE_CODE_LENGTH));

/** 招待を記録しなかった理由。 */
export type ReferralSkipReason = "unknown-code" | "self" | "already-recorded";

export type ReferralDecision =
  | { readonly ok: true; readonly referral: Referral }
  | { readonly ok: false; readonly reason: ReferralSkipReason };

/**
 * 招待リンクで開いた人(inviteeUserId)を「誘われた人」として記録するか決める。
 * - コードの持ち主がいない(inviterUserId が null)→ 記録しない
 * - 自分で自分を誘った → 記録しない
 * - すでに誰かに誘われた記録がある → 記録しない(最初の 1 回だけ)
 */
export function decideReferral(params: {
  readonly inviteeUserId: string;
  readonly inviterUserId: string | null;
  readonly existing: Referral | null;
  readonly now: Date;
}): ReferralDecision {
  const { inviteeUserId, inviterUserId, existing, now } = params;
  if (inviterUserId === null) return { ok: false, reason: "unknown-code" };
  if (inviterUserId === inviteeUserId) return { ok: false, reason: "self" };
  if (existing) return { ok: false, reason: "already-recorded" };
  return { ok: true, referral: { inviteeUserId, inviterUserId, createdAt: now.toISOString() } };
}
