/**
 * Supabase(= ネット上のデータベース)につなぐ部品。
 * サーバーだけが secret キー(sb_secret_...)でつなぐ。secret キーは RLS を通り抜けるので、
 * 絶対にブラウザ(public/ の画面)に渡さないこと。
 */
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

export type { SupabaseClient };

/** Postgres の「一意制約違反(同じ値がすでにある)」のエラーコード。 */
export const UNIQUE_VIOLATION = "23505";

export function createSupabaseClient(url: string, secretKey: string): SupabaseClient {
  return createClient(url, secretKey, {
    // サーバーで使うので、ログイン状態の保存・更新はしない(Cloudflare Workers でも動くように)
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

type SupabaseError = { readonly message: string; readonly code?: string } | null;

/** Supabase のエラーを、何をしようとして失敗したか付きで投げ直す(握りつぶさない)。 */
export function throwIfError(error: SupabaseError, action: string): void {
  if (!error) return;
  throw new Error(`Supabase で「${action}」に失敗しました: ${error.message}(code: ${error.code ?? "なし"})`);
}
