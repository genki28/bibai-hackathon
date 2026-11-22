/**
 * POST /api/identity/verify に送られてきた中身を確かめる(純粋関数)。
 * 受け付けるのは { userId, method, liveness } だけ。画像や顔の特徴の数値は受け取らない。
 */
import { VERIFICATION_METHODS, isValidUserId, isVerificationMethod } from "./store.js";
import type { VerificationResult } from "./store.js";

export const INVALID_USER_ID_MESSAGE = "ユーザー ID の形が正しくありません。";
export const INVALID_METHOD_MESSAGE = `確認の方式が正しくありません(${VERIFICATION_METHODS.join(" / ")} のどれか)。`;
export const INVALID_LIVENESS_MESSAGE = "liveness は true か false で送ってください。";

export type VerifyRequest = VerificationResult & { readonly userId: string };

export type ParseResult =
  | { readonly ok: true; readonly value: VerifyRequest }
  | { readonly ok: false; readonly error: string };

export function parseVerifyRequest(body: unknown): ParseResult {
  const input = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  if (!isValidUserId(input.userId)) return { ok: false, error: INVALID_USER_ID_MESSAGE };
  if (!isVerificationMethod(input.method)) return { ok: false, error: INVALID_METHOD_MESSAGE };
  if (typeof input.liveness !== "boolean") return { ok: false, error: INVALID_LIVENESS_MESSAGE };
  return {
    ok: true,
    value: { userId: input.userId, method: input.method, liveness: input.liveness },
  };
}
