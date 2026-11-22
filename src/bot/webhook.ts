import { messagingApi, middleware, webhook } from "@line/bot-sdk";
import type { Request, RequestHandler, Response } from "express";
import { MENU_NAMES } from "../users/roles.js";
import type { Role } from "../users/roles.js";
import { createRoleStore } from "../users/store.js";
import {
  buildRoleChoiceMessage,
  handleRegistrationPostback,
  parsePostback,
} from "./registration.js";
import type { RegistrationDeps } from "./registration.js";
import { createReplyText } from "./reply.js";

type BotCredentials = {
  readonly channelSecret: string;
  readonly channelAccessToken: string;
};

/** Webhook が外とやりとりする部分。テストでは偽物に差し替える。 */
export type WebhookDeps = RegistrationDeps & {
  readonly reply: (request: messagingApi.ReplyMessageRequest) => Promise<void>;
};

/** イベントに応じて返信するメッセージを決める。返信しないなら空。 */
async function decideMessages(
  event: webhook.Event,
  deps: WebhookDeps,
): Promise<messagingApi.Message[]> {
  if (event.type === "message" && event.message.type === "text") {
    return [{ type: "text", text: createReplyText(event.message.text) }];
  }
  if (event.type === "follow") {
    // 友だち追加されたら、すぐ登録してもらえるようにボタンを出す
    return [buildRoleChoiceMessage()];
  }
  const userId = event.source?.type === "user" ? event.source.userId : undefined;
  if (event.type === "postback" && userId) {
    const command = parsePostback(event.postback.data);
    return command ? handleRegistrationPostback(command, userId, deps) : [];
  }
  return [];
}

async function handleEvent(event: webhook.Event, deps: WebhookDeps): Promise<void> {
  const replyToken = "replyToken" in event ? event.replyToken : undefined;
  if (typeof replyToken !== "string") return;
  const messages = await decideMessages(event, deps);
  if (messages.length === 0) return;
  await deps.reply({ replyToken, messages });
}

/** 役割に合ったリッチメニューを、名前で探してその人に付ける。 */
function createMenuLinker(
  client: messagingApi.MessagingApiClient,
): (userId: string, role: Role) => Promise<void> {
  return async (userId, role) => {
    const { richmenus } = await client.getRichMenuList();
    const menu = richmenus.find((m) => m.name === MENU_NAMES[role]);
    if (!menu) {
      throw new Error(`リッチメニュー「${MENU_NAMES[role]}」が見つかりません。npm run richmenu を実行してください。`);
    }
    await client.linkRichMenuIdToUser(userId, menu.richMenuId);
  };
}

function createDefaultDeps(credentials: BotCredentials): WebhookDeps {
  const client = new messagingApi.MessagingApiClient({
    channelAccessToken: credentials.channelAccessToken,
  });
  return {
    roleStore: createRoleStore(),
    linkMenu: createMenuLinker(client),
    reply: async (request) => {
      await client.replyMessage(request);
    },
  };
}

/**
 * LINE からの通知(Webhook)を受け取る処理。
 * 1 つ目で「本当に LINE から来たか」を署名で確認し、2 つ目で返信する。
 */
export function createWebhookHandlers(
  credentials: BotCredentials,
  overrides: Partial<WebhookDeps> = {},
): RequestHandler[] {
  const deps: WebhookDeps = { ...createDefaultDeps(credentials), ...overrides };
  const verifySignature = middleware({
    channelSecret: credentials.channelSecret,
  });

  const handleEvents = async (req: Request, res: Response): Promise<void> => {
    const body = req.body as webhook.CallbackRequest;
    const events = Array.isArray(body?.events) ? body.events : [];
    await Promise.all(events.map((event) => handleEvent(event, deps)));
    res.json({ success: true, data: { handled: events.length } });
  };

  return [verifySignature, handleEvents];
}
