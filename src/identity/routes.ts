import express from "express";
import type { Router } from "express";
import { createIdentityStore, isValidUserId } from "./store.js";
import type { IdentityStore } from "./store.js";

const INVALID_USER_ID_MESSAGE = "ユーザー ID の形が正しくありません。";

/**
 * 本人確認(デモ)の API。
 * - GET  /api/identity/:userId   … 確認済みかどうかを返す
 * - POST /api/identity/mock-verify { userId } … 確認済みにする(デモなので、何も確かめずに確認済みになる)
 */
export function createIdentityRouter(
  store: IdentityStore = createIdentityStore(),
): Router {
  const router = express.Router();
  router.use(express.json());

  router.post("/api/identity/mock-verify", (req, res) => {
    const userId: unknown = req.body?.userId;
    if (!isValidUserId(userId)) {
      res.status(400).json({ success: false, error: INVALID_USER_ID_MESSAGE });
      return;
    }
    res.json({ success: true, data: store.markVerified(userId, new Date()) });
  });

  router.get("/api/identity/:userId", (req, res) => {
    const { userId } = req.params;
    if (!isValidUserId(userId)) {
      res.status(400).json({ success: false, error: INVALID_USER_ID_MESSAGE });
      return;
    }
    res.json({ success: true, data: store.getStatus(userId) });
  });

  return router;
}
