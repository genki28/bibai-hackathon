import { messagingApi, middleware, webhook } from "@line/bot-sdk";
import type { Request, RequestHandler, Response } from "express";
import { createReplyText } from "./reply.js";

type BotCredentials = {
  readonly channelSecret: string;
  readonly channelAccessToken: string;
};

type TextMessageEvent = webhook.MessageEvent & {
  replyToken: string;
  message: webhook.TextMessageContent;
};

function isTextMessageEvent(event: webhook.Event): event is TextMessageEvent {
  return (
    event.type === "message" &&
    event.message.type === "text" &&
    typeof event.replyToken === "string"
  );
}

async function replyToEvent(
  client: messagingApi.MessagingApiClient,
  event: webhook.Event,
): Promise<void> {
  if (!isTextMessageEvent(event)) {
    return;
  }
  await client.replyMessage({
    replyToken: event.replyToken,
    messages: [{ type: "text", text: createReplyText(event.message.text) }],
  });
}

/**
 * LINE からの通知(Webhook)を受け取る処理。
 * 1 つ目で「本当に LINE から来たか」を署名で確認し、2 つ目で返信する。
 */
export function createWebhookHandlers(
  credentials: BotCredentials,
): RequestHandler[] {
  const client = new messagingApi.MessagingApiClient({
    channelAccessToken: credentials.channelAccessToken,
  });
  const verifySignature = middleware({
    channelSecret: credentials.channelSecret,
  });

  const handleEvents = async (req: Request, res: Response): Promise<void> => {
    const body = req.body as webhook.CallbackRequest;
    const events = Array.isArray(body?.events) ? body.events : [];
    await Promise.all(events.map((event) => replyToEvent(client, event)));
    res.json({ success: true, data: { handled: events.length } });
  };

  return [verifySignature, handleEvents];
}
