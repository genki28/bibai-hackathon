import express from "express";
import type { Router } from "express";
import type { HelpRequestStore } from "../help-requests/store.js";
import type { IdentityStore } from "../identity/store.js";
import type { RoleStore } from "../users/store.js";
import { TEST_USER_IDS } from "./users.js";

export type TestModeRouterDeps = {
  readonly helpRequestStore: HelpRequestStore;
  readonly identityStore: IdentityStore;
  readonly roleStore: RoleStore;
};

/**
 * テスト用の API(TEST_MODE が "true" のときだけ app.ts がつなぐ。オフのときは 404)。
 * - POST /api/test/reset … テスト用の利用者(users.ts)が関わったデータだけを消す
 *   (依頼した人か参加者がテスト用の ID の依頼・テスト用の ID の役割・本人確認の結果)。
 *   ほかの人のデータは消さない。
 */
export function createTestModeRouter(deps: TestModeRouterDeps): Router {
  const router = express.Router();

  router.post("/api/test/reset", async (_req, res) => {
    const deletedRequests = await deps.helpRequestStore.deleteInvolving(TEST_USER_IDS);
    await Promise.all(
      TEST_USER_IDS.flatMap((userId) => [deps.identityStore.remove(userId), deps.roleStore.clearRole(userId)]),
    );
    console.log(`[テスト] テスト用の利用者のデータを消しました(依頼 ${deletedRequests} 件)`);
    res.json({ success: true, data: { deletedRequests, userIds: TEST_USER_IDS } });
  });

  return router;
}
