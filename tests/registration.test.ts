import { createHmac } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { messagingApi } from "@line/bot-sdk";
import express from "express";
import { afterEach, expect, test } from "vitest";
import { handleRegistrationPostback, parsePostback } from "../src/bot/registration.js";
import type { RegistrationDeps } from "../src/bot/registration.js";
import { createWebhookHandlers } from "../src/bot/webhook.js";
import { createRoleStore } from "../src/users/store.js";
import type { Role } from "../src/users/roles.js";

// テスト用の架空の値(本物の秘密情報・ユーザーではありません)
const DUMMY_SECRET = "dummy-secret-for-test";
const USER_ID = `U${"c".repeat(32)}`;

type Linked = { readonly userId: string; readonly role: Role };

function makeDeps(): RegistrationDeps & { readonly linked: Linked[] } {
  const linked: Linked[] = [];
  return {
    roleStore: createRoleStore(),
    linkMenu: async (userId, role) => {
      linked.push({ userId, role });
    },
    linked,
  };
}

const servers: Server[] = [];

afterEach(async () => {
  const closing = servers.splice(0).map(
    (server) => new Promise((resolve) => server.close(resolve)),
  );
  await Promise.all(closing);
});

test("ポストバックの合図を読み取る(登録の開始・役割の選択)", () => {
  // Arrange & Act & Assert
  expect(parsePostback("action=register")).toEqual({ type: "register" });
  expect(parsePostback("action=set-role&role=elder")).toEqual({ type: "set-role", role: "elder" });
  expect(parsePostback("action=set-role&role=helper")).toEqual({ type: "set-role", role: "helper" });
});

test("知らない合図や、ありえない役割は無視する", () => {
  // Arrange
  const invalid = ["", "action=unknown", "action=set-role", "action=set-role&role=admin"];

  // Act & Assert
  invalid.forEach((data) => expect(parsePostback(data)).toBeNull());
});

test("「利用者登録」を押すと、助けてほしい / 助けたい の 2 つのボタンを返す", async () => {
  // Arrange
  const deps = makeDeps();

  // Act
  const messages = await handleRegistrationPostback({ type: "register" }, USER_ID, deps);

  // Assert
  expect(messages).toHaveLength(1);
  const message = messages[0] as messagingApi.TemplateMessage;
  expect(message.type).toBe("template");
  const template = message.template as messagingApi.ButtonsTemplate;
  const actions = template.actions as messagingApi.PostbackAction[];
  expect(actions.map((a) => a.data)).toEqual([
    "action=set-role&role=elder",
    "action=set-role&role=helper",
  ]);
  expect(deps.linked).toEqual([]);
});

test("役割を選ぶと保存して、その役割のメニューに切り替え、登録完了を伝える", async () => {
  // Arrange
  const deps = makeDeps();

  // Act
  const messages = await handleRegistrationPostback(
    { type: "set-role", role: "helper" },
    USER_ID,
    deps,
  );

  // Assert
  expect(deps.roleStore.getRole(USER_ID)).toBe("helper");
  expect(deps.linked).toEqual([{ userId: USER_ID, role: "helper" }]);
  const text = (messages[0] as messagingApi.TextMessage).text;
  expect(text).toContain("助けたい");
});

test("あとから役割を変えると、新しい役割で上書きされる", async () => {
  // Arrange
  const deps = makeDeps();
  await handleRegistrationPostback({ type: "set-role", role: "helper" }, USER_ID, deps);

  // Act
  await handleRegistrationPostback({ type: "set-role", role: "elder" }, USER_ID, deps);

  // Assert
  expect(deps.roleStore.getRole(USER_ID)).toBe("elder");
  expect(deps.linked.map((l) => l.role)).toEqual(["helper", "elder"]);
});

test("POST /webhook でポストバックを受け取ると、役割を保存して返信する", async () => {
  // Arrange
  const deps = makeDeps();
  const replies: messagingApi.ReplyMessageRequest[] = [];
  const handlers = createWebhookHandlers(
    { channelSecret: DUMMY_SECRET, channelAccessToken: "dummy-token-for-test" },
    {
      ...deps,
      reply: async (request) => {
        replies.push(request);
      },
    },
  );
  const app = express();
  app.post("/webhook", ...handlers);
  const server = app.listen(0);
  servers.push(server);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  const body = JSON.stringify({
    destination: "Udummy",
    events: [
      {
        type: "postback",
        mode: "active",
        timestamp: 0,
        webhookEventId: "dummy",
        deliveryContext: { isRedelivery: false },
        replyToken: "dummy-reply-token",
        source: { type: "user", userId: USER_ID },
        postback: { data: "action=set-role&role=elder" },
      },
    ],
  });
  const signature = createHmac("sha256", DUMMY_SECRET).update(body).digest("base64");

  // Act
  const response = await fetch(`http://127.0.0.1:${port}/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-line-signature": signature },
    body,
  });

  // Assert
  expect(response.status).toBe(200);
  expect(deps.roleStore.getRole(USER_ID)).toBe("elder");
  expect(deps.linked).toEqual([{ userId: USER_ID, role: "elder" }]);
  expect(replies).toHaveLength(1);
  expect(replies[0]?.replyToken).toBe("dummy-reply-token");
});
