import { JSONParseError, SignatureValidationFailed } from "@line/bot-sdk";
import express from "express";
import type { ErrorRequestHandler, Express, RequestHandler } from "express";
import { fileURLToPath } from "node:url";
import { createWebhookHandlers } from "./bot/webhook.js";
import { isBotConfigured, isLiffConfigured } from "./config.js";
import type { AppConfig } from "./config.js";

const PUBLIC_DIR = fileURLToPath(new URL("../public", import.meta.url));

const BOT_NOT_CONFIGURED_MESSAGE =
  "LINE Bot の設定がまだです。.env に LINE_CHANNEL_SECRET と LINE_CHANNEL_ACCESS_TOKEN を入れて、サーバーを再起動してください。";

const botNotConfigured: RequestHandler = (_req, res) => {
  res.status(503).json({ success: false, error: BOT_NOT_CONFIGURED_MESSAGE });
};

const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ success: false, error: "ページが見つかりません。" });
};

function toErrorResponse(err: unknown): { status: number; error: string } {
  if (err instanceof SignatureValidationFailed) {
    return { status: 401, error: "LINE の署名を確認できませんでした。" };
  }
  if (err instanceof JSONParseError) {
    return { status: 400, error: "リクエストの形式が正しくありません。" };
  }
  return { status: 500, error: "サーバーでエラーが起きました。" };
}

const handleError: ErrorRequestHandler = (err, req, res, _next) => {
  const { status, error } = toErrorResponse(err);
  console.error(`[エラー] ${req.method} ${req.path} (${status})`, err);
  res.status(status).json({ success: false, error });
};

/** Express アプリ(= サーバーの本体)を組み立てて返す。 */
export function createApp(config: AppConfig): Express {
  const app = express();
  const botConfigured = isBotConfigured(config);
  const liffConfigured = isLiffConfigured(config);

  app.get("/health", (_req, res) => {
    res.json({
      success: true,
      data: { status: "ok", botConfigured, liffConfigured },
    });
  });

  // 注意: LINE の署名確認は「生のボディ」が必要。この行より前に express.json() を足さないこと。
  const webhookHandlers = botConfigured
    ? createWebhookHandlers(config)
    : [botNotConfigured];
  app.post("/webhook", ...webhookHandlers);

  // LIFF ID は公開してよい値。シークレットやアクセストークンは絶対に返さない。
  app.get("/api/config", (_req, res) => {
    res.json({ success: true, data: { liffId: config.liffId } });
  });

  app.get("/", (_req, res) => {
    res.redirect("/liff/");
  });
  app.use(express.static(PUBLIC_DIR));

  app.use(notFound);
  app.use(handleError);
  return app;
}
