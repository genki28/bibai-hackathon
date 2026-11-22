import express from "express";
import type { Router } from "express";
import { channelIdFromLiffId, InvalidIdTokenError } from "./idToken.js";
import type { VerifyIdToken } from "./idToken.js";
import type { RoleStore } from "./store.js";

export type UsersRouterDeps = {
  readonly liffId: string;
  readonly roleStore: RoleStore;
  readonly verifyIdToken: VerifyIdToken;
  /** その人のリッチメニューの紐付けを外す(= 全員共通の「利用者登録」メニューに戻る)。 */
  readonly unlinkMenu: ((userId: string) => Promise<void>) | null;
};

const NOT_CONFIGURED = "LINE の設定がまだなので、メニューを戻せません。";
const NO_TOKEN = "LINE の中で画面を開いてから、もう一度押してください。";
const INVALID_TOKEN = "LINE のログインを確認できませんでした。画面を開き直してください。";

/**
 * POST /api/users/reset-menu { idToken } … 登録を取り消して、リッチメニューを最初(利用者登録)に戻す。
 */
export function createUsersRouter(deps: UsersRouterDeps): Router {
  const router = express.Router();
  router.use("/api/users", express.json());

  router.post("/api/users/reset-menu", async (req, res) => {
    const channelId = channelIdFromLiffId(deps.liffId);
    if (!channelId || !deps.unlinkMenu) {
      res.status(503).json({ success: false, error: NOT_CONFIGURED });
      return;
    }
    const idToken: unknown = req.body?.idToken;
    if (typeof idToken !== "string" || idToken === "") {
      res.status(400).json({ success: false, error: NO_TOKEN });
      return;
    }
    try {
      const userId = await deps.verifyIdToken(idToken, channelId);
      await deps.unlinkMenu(userId);
      await deps.roleStore.clearRole(userId);
      res.json({ success: true, data: { reset: true } });
    } catch (error: unknown) {
      if (error instanceof InvalidIdTokenError) {
        res.status(401).json({ success: false, error: INVALID_TOKEN });
        return;
      }
      console.error("[エラー] メニューを戻せませんでした", error);
      res.status(500).json({ success: false, error: "メニューを戻せませんでした。" });
    }
  });

  return router;
}
