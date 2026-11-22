import express from "express";
import type { Router } from "express";
import { MOCK_CARD_RESULT, createIdentityStore, isValidUserId } from "./store.js";
import type { IdentityStore } from "./store.js";
import { INVALID_USER_ID_MESSAGE, parseVerifyRequest } from "./validate.js";

/**
 * 本人確認(デモ)の API。
 * - GET  /api/identity/:userId   … 確認済みかどうかを返す
 * - POST /api/identity/verify { userId, method, liveness }
 *     … 確認の「結果だけ」を保存する(顔の照合はスマホの中で済ませる。画像は受け取らない)
 * - POST /api/identity/mock-verify { userId }
 *     … カードのデモ。何も確かめずに確認済みにする(予備のボタン用)
 */
export function createIdentityRouter(
  store: IdentityStore = createIdentityStore(),
): Router {
  const router = express.Router();
  router.use(express.json());

  router.post("/api/identity/verify", async (req, res) => {
    const parsed = parseVerifyRequest(req.body);
    if (!parsed.ok) {
      res.status(400).json({ success: false, error: parsed.error });
      return;
    }
    const { userId, method, liveness } = parsed.value;
    res.json({ success: true, data: await store.markVerified(userId, new Date(), { method, liveness }) });
  });

  router.post("/api/identity/mock-verify", async (req, res) => {
    const userId: unknown = req.body?.userId;
    if (!isValidUserId(userId)) {
      res.status(400).json({ success: false, error: INVALID_USER_ID_MESSAGE });
      return;
    }
    res.json({ success: true, data: await store.markVerified(userId, new Date(), MOCK_CARD_RESULT) });
  });

  router.get("/api/identity/:userId", async (req, res) => {
    const { userId } = req.params;
    if (!isValidUserId(userId)) {
      res.status(400).json({ success: false, error: INVALID_USER_ID_MESSAGE });
      return;
    }
    res.json({ success: true, data: await store.getStatus(userId) });
  });

  return router;
}
