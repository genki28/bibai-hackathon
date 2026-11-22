import express from "express";
import type { Router } from "express";
import { isValidUserId } from "../identity/store.js";
import { isValidInviteCode } from "./model.js";
import type { InviteStore } from "./store.js";

export type InviteRouterOptions = {
  readonly store: InviteStore;
  readonly now?: () => Date;
};

type Body = Record<string, unknown>;
const asBody = (raw: unknown): Body => (typeof raw === "object" && raw !== null ? (raw as Body) : {});

/**
 * 招待(友だちを誘う)の API。{ success, data } か { success: false, error } で返す。
 * - GET  /api/invites/mine?userId=   … 自分の招待コード { code }(なければ作る)
 * - POST /api/invites/accept { userId, code } … 招待リンクで開いた人を 1 回だけ記録 { accepted, reason? }
 *   自分自身・すでに記録済み・持ち主のいないコードは記録しない(エラーにはせず accepted: false)
 * 誘った人のユーザー ID は返さない(ほかの人に LINE の ID を知られないように)。
 * ⚠ ほかの API と同じく、送られてきた userId をそのまま信じている(LINE の ID トークンでの確認は未実装)。
 */
export function createInviteRouter(options: InviteRouterOptions): Router {
  const { store } = options;
  const now = options.now ?? (() => new Date());
  const router = express.Router();
  router.use("/api/invites", express.json());

  router.get("/api/invites/mine", async (req, res) => {
    const { userId } = req.query;
    if (!isValidUserId(userId)) {
      res.status(400).json({ success: false, error: "ユーザー ID の形が正しくありません。" });
      return;
    }
    const invite = await store.getOrCreateCode(userId, now());
    res.json({ success: true, data: { code: invite.code } });
  });

  router.post("/api/invites/accept", async (req, res) => {
    const { userId, code } = asBody(req.body);
    if (!isValidUserId(userId) || !isValidInviteCode(code)) {
      res.status(400).json({ success: false, error: "招待の内容が正しくありません。" });
      return;
    }
    const result = await store.accept(userId, code, now());
    res.json({
      success: true,
      data: result.accepted ? { accepted: true } : { accepted: false, reason: result.reason },
    });
  });

  return router;
}
