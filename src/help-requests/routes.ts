import express from "express";
import type { Router } from "express";
import { isValidUserId } from "../identity/store.js";
import { createHelpRequestStore, parseHelpRequestInput } from "./store.js";
import type { HelpRequestStore } from "./store.js";

/**
 * 雪かきの依頼の API。
 * - POST /api/help-requests { userId, amount? } … 依頼を登録する(amount: "little" | "normal" | "lots")
 * - GET  /api/help-requests … 待っている依頼の一覧(若者側の「助けに行く」で使う予定)
 * - GET  /api/help-requests/mine/:userId … その人の待っている依頼(なければ null)。
 *   「たすけて」を押したとき、すでに呼んでいれば待機画面に移るために使う
 */
export function createHelpRequestRouter(
  store: HelpRequestStore = createHelpRequestStore(),
): Router {
  const router = express.Router();
  router.use("/api/help-requests", express.json());

  router.post("/api/help-requests", (req, res) => {
    const input = parseHelpRequestInput(req.body);
    if (!input) {
      res.status(400).json({ success: false, error: "依頼の内容が正しくありません。" });
      return;
    }
    res.status(201).json({ success: true, data: store.create(input, new Date()) });
  });

  router.get("/api/help-requests", (_req, res) => {
    res.json({ success: true, data: store.listWaiting() });
  });

  router.get("/api/help-requests/mine/:userId", (req, res) => {
    const { userId } = req.params;
    if (!isValidUserId(userId)) {
      res.status(400).json({ success: false, error: "ユーザー ID の形が正しくありません。" });
      return;
    }
    res.json({ success: true, data: store.findWaiting(userId) });
  });

  return router;
}
