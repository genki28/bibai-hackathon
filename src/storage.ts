/**
 * データの保存先を選ぶ。
 * - SUPABASE_URL と SUPABASE_SECRET_KEY の両方があれば Supabase(データが残る)
 * - なければサーバーのメモリ(再起動で消える。手元で試す・テスト用)
 */
import type { AppConfig } from "./config.js";
import { isSupabaseConfigured } from "./config.js";
import { createHelpRequestStore } from "./help-requests/store.js";
import type { HelpRequestStore } from "./help-requests/store.js";
import { createSupabaseHelpRequestRepository } from "./help-requests/supabase-repository.js";
import { createIdentityStore } from "./identity/store.js";
import type { IdentityStore } from "./identity/store.js";
import { createSupabaseIdentityStore } from "./identity/supabase-store.js";
import { createSupabaseClient } from "./supabase.js";
import { createRoleStore } from "./users/store.js";
import type { RoleStore } from "./users/store.js";
import { createSupabaseRoleStore } from "./users/supabase-store.js";

export type StorageKind = "supabase" | "memory";

export type Stores = {
  readonly kind: StorageKind;
  readonly helpRequestStore: HelpRequestStore;
  readonly identityStore: IdentityStore;
  readonly roleStore: RoleStore;
};

/** 起動ログに出す保存先の名前。 */
export const STORAGE_LABELS: Readonly<Record<StorageKind, string>> = {
  supabase: "Supabase",
  memory: "メモリ(再起動すると消えます)",
};

export function createMemoryStores(): Stores {
  return {
    kind: "memory",
    helpRequestStore: createHelpRequestStore(),
    identityStore: createIdentityStore(),
    roleStore: createRoleStore(),
  };
}

export function createStores(config: AppConfig): Stores {
  if (!isSupabaseConfigured(config)) return createMemoryStores();
  const client = createSupabaseClient(config.supabaseUrl, config.supabaseSecretKey);
  return {
    kind: "supabase",
    helpRequestStore: createHelpRequestStore(createSupabaseHelpRequestRepository(client)),
    identityStore: createSupabaseIdentityStore(client),
    roleStore: createSupabaseRoleStore(client),
  };
}
