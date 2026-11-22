import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, expect, test } from "vitest";
import { createApp } from "../src/app.js";
import type { AppConfig } from "../src/config.js";
import { channelIdFromLiffId, InvalidIdTokenError } from "../src/users/idToken.js";
import { createRoleStore } from "../src/users/store.js";

// テスト用の架空の値(本物の秘密情報・ユーザーではありません)
const USER_ID = `U${"e".repeat(32)}`;
const CONFIG: AppConfig = {
  channelSecret: "dummy-secret-for-test",
  channelAccessToken: "dummy-token-for-test",
  liffId: "1234567890-AbCdEfGh",
  port: 0,
  supabaseUrl: "",
  supabaseSecretKey: "",
};

type Calls = { verified: string[]; unlinked: string[] };

const servers: Server[] = [];

async function startApp(
  config: AppConfig,
  verify: (idToken: string, channelId: string) => Promise<string>,
): Promise<{ baseUrl: string; calls: Calls; roleStore: ReturnType<typeof createRoleStore> }> {
  const calls: Calls = { verified: [], unlinked: [] };
  const roleStore = createRoleStore();
  const app = createApp(config, {
    roleStore,
    verifyIdToken: async (idToken, channelId) => {
      calls.verified.push(`${idToken}@${channelId}`);
      return verify(idToken, channelId);
    },
    unlinkMenu: async (userId) => {
      calls.unlinked.push(userId);
    },
  });
  const server = app.listen(0);
  servers.push(server);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${port}`, calls, roleStore };
}

function postReset(baseUrl: string, body: unknown): Promise<Response> {
  return fetch(`${baseUrl}/api/users/reset-menu`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterEach(async () => {
  const closing = servers.splice(0).map(
    (server) => new Promise((resolve) => server.close(resolve)),
  );
  await Promise.all(closing);
});

test("LIFF ID の前半(ハイフンの前)を LINE ログインのチャネル ID として取り出す", () => {
  // Arrange & Act & Assert
  expect(channelIdFromLiffId("1234567890-AbCdEfGh")).toBe("1234567890");
  expect(channelIdFromLiffId("")).toBeNull();
  expect(channelIdFromLiffId("abc-def")).toBeNull();
});

test("本人の証明が正しければ、役割を消してメニューを最初に戻す", async () => {
  // Arrange
  const { baseUrl, calls, roleStore } = await startApp(CONFIG, async () => USER_ID);
  await roleStore.setRole(USER_ID, "helper");

  // Act
  const response = await postReset(baseUrl, { idToken: "dummy-id-token" });
  const body = await response.json();

  // Assert
  expect(response.status).toBe(200);
  expect(body).toEqual({ success: true, data: { reset: true } });
  expect(calls.verified).toEqual(["dummy-id-token@1234567890"]);
  expect(calls.unlinked).toEqual([USER_ID]);
  expect(await roleStore.getRole(USER_ID)).toBeNull();
});

test("本人の証明がないと 400 を返し、何もしない", async () => {
  // Arrange
  const { baseUrl, calls } = await startApp(CONFIG, async () => USER_ID);

  // Act
  const response = await postReset(baseUrl, {});

  // Assert
  expect(response.status).toBe(400);
  expect((await response.json()).success).toBe(false);
  expect(calls.unlinked).toEqual([]);
});

test("本人の証明が正しくないと 401 を返し、何もしない", async () => {
  // Arrange
  const { baseUrl, calls } = await startApp(CONFIG, async () => {
    throw new InvalidIdTokenError();
  });

  // Act
  const response = await postReset(baseUrl, { idToken: "forged-token" });

  // Assert
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({
    success: false,
    error: "LINE のログインを確認できませんでした。画面を開き直してください。",
  });
  expect(calls.unlinked).toEqual([]);
});

test("LINE の設定がまだなら 503 を返す", async () => {
  // Arrange
  const { baseUrl, calls } = await startApp({ ...CONFIG, liffId: "" }, async () => USER_ID);

  // Act
  const response = await postReset(baseUrl, { idToken: "dummy-id-token" });

  // Assert
  expect(response.status).toBe(503);
  expect(calls.verified).toEqual([]);
});
