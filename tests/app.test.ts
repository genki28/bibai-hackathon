import { createHmac } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, expect, test, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { AppConfig } from "../src/config.js";

// テスト専用のダミー値(本物の秘密情報ではありません)
const DUMMY_SECRET = "dummy-secret-for-test";
const EMPTY_CONFIG: AppConfig = {
  channelSecret: "",
  channelAccessToken: "",
  liffId: "",
  port: 0,
  supabaseUrl: "",
  supabaseSecretKey: "",
  testMode: false,
};
const BOT_CONFIG: AppConfig = {
  ...EMPTY_CONFIG,
  channelSecret: DUMMY_SECRET,
  channelAccessToken: "dummy-token-for-test",
};

const servers: Server[] = [];

async function startApp(config: AppConfig): Promise<string> {
  const server = createApp(config).listen(0);
  servers.push(server);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

function sign(body: string): string {
  return createHmac("sha256", DUMMY_SECRET).update(body).digest("base64");
}

afterEach(async () => {
  vi.restoreAllMocks();
  const closing = servers.splice(0).map(
    (server) => new Promise((resolve) => server.close(resolve)),
  );
  await Promise.all(closing);
});

test("GET /health は未設定でも ok を返し、Bot と LIFF が未設定だと分かる", async () => {
  // Arrange
  const baseUrl = await startApp(EMPTY_CONFIG);

  // Act
  const response = await fetch(`${baseUrl}/health`);
  const body = await response.json();

  // Assert
  expect(response.status).toBe(200);
  expect(body).toEqual({
    success: true,
    data: { status: "ok", botConfigured: false, liffConfigured: false },
  });
});

test("GET /api/config は LIFF ID とテストモードかどうかだけを返し、秘密情報は含めない", async () => {
  // Arrange
  const baseUrl = await startApp({ ...BOT_CONFIG, liffId: "dummy-liff-id" });

  // Act
  const response = await fetch(`${baseUrl}/api/config`);
  const text = await response.text();

  // Assert
  expect(JSON.parse(text)).toEqual({
    success: true,
    data: { liffId: "dummy-liff-id", testMode: false, testUsers: [] },
  });
  expect(text).not.toContain(BOT_CONFIG.channelSecret);
  expect(text).not.toContain(BOT_CONFIG.channelAccessToken);
});

test("POST /webhook は秘密情報が未設定なら 503 と日本語の案内を返す", async () => {
  // Arrange
  const baseUrl = await startApp(EMPTY_CONFIG);

  // Act
  const response = await fetch(`${baseUrl}/webhook`, { method: "POST", body: "{}" });
  const body = await response.json();

  // Assert
  expect(response.status).toBe(503);
  expect(body.success).toBe(false);
  expect(body.error).toContain("LINE_CHANNEL_SECRET");
});

test("POST /webhook は署名が間違っていると 401 を返す", async () => {
  // Arrange
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  const baseUrl = await startApp(BOT_CONFIG);

  // Act
  const response = await fetch(`${baseUrl}/webhook`, {
    method: "POST",
    headers: { "x-line-signature": "wrong-signature" },
    body: JSON.stringify({ destination: "x", events: [] }),
  });
  const body = await response.json();

  // Assert
  expect(response.status).toBe(401);
  expect(body.success).toBe(false);
});

test("POST /webhook は正しい署名でイベントが空なら 200 を返す", async () => {
  // Arrange
  const baseUrl = await startApp(BOT_CONFIG);
  const payload = JSON.stringify({ destination: "x", events: [] });

  // Act
  const response = await fetch(`${baseUrl}/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-line-signature": sign(payload) },
    body: payload,
  });
  const body = await response.json();

  // Assert
  expect(response.status).toBe(200);
  expect(body).toEqual({ success: true, data: { handled: 0 } });
});

test("GET /liff/ は LIFF 画面の HTML を返す", async () => {
  // Arrange
  const baseUrl = await startApp(EMPTY_CONFIG);

  // Act
  const response = await fetch(`${baseUrl}/liff/`);
  const html = await response.text();

  // Assert
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("text/html");
  expect(html).toContain("static.line-scdn.net/liff/edge/2/sdk.js");
});

test("存在しない URL は 404 を success:false の形式で返す", async () => {
  // Arrange
  const baseUrl = await startApp(EMPTY_CONFIG);

  // Act
  const response = await fetch(`${baseUrl}/no-such-page`);
  const body = await response.json();

  // Assert
  expect(response.status).toBe(404);
  expect(body.success).toBe(false);
});
