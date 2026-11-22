import express from "express";
import type { Router } from "express";
import { createHelpRequestStore, parseHelpRequestInput } from "./store.js";
import type { HelpRequestStore } from "./store.js";

/**
 * 雪かきの依頼の API。
 * - POST /api/help-requests { userId, amount? } … 依頼を登録する(amount: "little" | "normal" | "lots")
 * - GET  /api/help-requests … 待っている依頼の一覧(若者側の「助けに行く」で使う予定)
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

  return router;
}
