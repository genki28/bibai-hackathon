import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, expect, test } from "vitest";
import { createApp } from "../src/app.js";
import type { AppConfig } from "../src/config.js";
import { createIdentityStore, isValidUserId } from "../src/identity/store.js";
import {
  INVALID_LIVENESS_MESSAGE,
  INVALID_METHOD_MESSAGE,
  INVALID_USER_ID_MESSAGE,
  parseVerifyRequest,
} from "../src/identity/validate.js";

const CONFIG: AppConfig = {
  channelSecret: "",
  channelAccessToken: "",
  liffId: "",
  port: 0,
  supabaseUrl: "",
  supabaseSecretKey: "",
  testMode: false,
};
// テスト用の架空のユーザー ID(LINE のユーザー ID と同じ形: U + 英数字 32 文字)
const USER_ID = `U${"a".repeat(32)}`;

const servers: Server[] = [];

async function startApp(): Promise<string> {
  const server = createApp(CONFIG).listen(0);
  servers.push(server);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

function postVerify(baseUrl: string, body: unknown): Promise<Response> {
  return fetch(`${baseUrl}/api/identity/mock-verify`, {
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

test("LINE のユーザー ID の形だけを正しい ID として扱う", () => {
  // Arrange
  const valid = [USER_ID, `U${"0123456789abcdef".repeat(2)}`];
  const invalid = ["", "U123", "abc", `X${"a".repeat(32)}`, 123, null];

  // Act & Assert
  valid.forEach((id) => expect(isValidUserId(id)).toBe(true));
  invalid.forEach((id) => expect(isValidUserId(id)).toBe(false));
});

test("確認していない人は未確認、確認した人は確認日時つきで確認済みになる", async () => {
  // Arrange
  const store = createIdentityStore();
  const now = new Date("2026-11-22T10:00:00Z");

  // Act
  const before = await store.getStatus(USER_ID);
  const saved = await store.markVerified(USER_ID, now);
  const after = await store.getStatus(USER_ID);

  // Assert
  expect(before).toEqual({ verified: false, verifiedAt: null, method: null, liveness: null });
  expect(saved).toEqual(after);
  expect(after).toEqual({
    verified: true,
    verifiedAt: "2026-11-22T10:00:00.000Z",
    method: "mynumber-card-mock",
    liveness: false,
  });
});

test("GET /api/identity/:userId は確認前なら未確認を返す", async () => {
  // Arrange
  const baseUrl = await startApp();

  // Act
  const response = await fetch(`${baseUrl}/api/identity/${USER_ID}`);
  const body = await response.json();

  // Assert
  expect(response.status).toBe(200);
  expect(body).toEqual({
    success: true,
    data: { verified: false, verifiedAt: null, method: null, liveness: null },
  });
});

test("POST /api/identity/mock-verify で確認済みになり、その後の取得にも反映される", async () => {
  // Arrange
  const baseUrl = await startApp();

  // Act
  const postResponse = await postVerify(baseUrl, { userId: USER_ID });
  const postBody = await postResponse.json();
  const getBody = await (await fetch(`${baseUrl}/api/identity/${USER_ID}`)).json();

  // Assert
  expect(postResponse.status).toBe(200);
  expect(postBody.success).toBe(true);
  expect(postBody.data.verified).toBe(true);
  expect(postBody.data.method).toBe("mynumber-card-mock");
  expect(getBody.data).toEqual(postBody.data);
});

test("ユーザー ID の形が正しくないと 400 と日本語のエラーを返す", async () => {
  // Arrange
  const baseUrl = await startApp();

  // Act
  const postResponse = await postVerify(baseUrl, { userId: "not-a-user" });
  const getResponse = await fetch(`${baseUrl}/api/identity/not-a-user`);

  // Assert
  expect(postResponse.status).toBe(400);
  expect(await postResponse.json()).toEqual({
    success: false,
    error: "ユーザー ID の形が正しくありません。",
  });
  expect(getResponse.status).toBe(400);
});

test("壊れた JSON を送ると 400 を返す", async () => {
  // Arrange
  const baseUrl = await startApp();

  // Act
  const response = await fetch(`${baseUrl}/api/identity/mock-verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{broken",
  });

  // Assert
  expect(response.status).toBe(400);
  expect((await response.json()).success).toBe(false);
});

function postFaceVerify(baseUrl: string, body: unknown): Promise<Response> {
  return fetch(`${baseUrl}/api/identity/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("顔の照合の結果を、方式とライブネスつきで保存できる", async () => {
  // Arrange
  const store = createIdentityStore();
  const now = new Date("2026-11-23T09:00:00Z");

  // Act
  const saved = await store.markVerified(USER_ID, now, { method: "face-match-demo", liveness: true });

  // Assert
  expect(saved).toEqual({
    verified: true,
    verifiedAt: "2026-11-23T09:00:00.000Z",
    method: "face-match-demo",
    liveness: true,
  });
  expect(await store.getStatus(USER_ID)).toEqual(saved);
});

test("送られてきた本人確認の結果は、決まった形のときだけ受け付ける", () => {
  // Arrange
  const good = { userId: USER_ID, method: "face-match-demo", liveness: false };
  const bad = [
    [null, INVALID_USER_ID_MESSAGE],
    ["文字", INVALID_USER_ID_MESSAGE],
    [{ ...good, userId: "U123" }, INVALID_USER_ID_MESSAGE],
    [{ ...good, method: "passport" }, INVALID_METHOD_MESSAGE],
    [{ ...good, method: undefined }, INVALID_METHOD_MESSAGE],
    [{ ...good, liveness: "true" }, INVALID_LIVENESS_MESSAGE],
    [{ userId: USER_ID, method: "face-match-demo" }, INVALID_LIVENESS_MESSAGE],
  ] as const;

  // Act
  const accepted = parseVerifyRequest({ ...good, image: "data:image/png;base64,xxx" });

  // Assert
  // 余計な項目(画像など)は受け取っても捨てて、決まった 3 つだけを返す
  expect(accepted).toEqual({ ok: true, value: good });
  bad.forEach(([body, error]) => expect(parseVerifyRequest(body)).toEqual({ ok: false, error }));
});

test("POST /api/identity/verify で顔の照合の結果が保存され、取得にも反映される", async () => {
  // Arrange
  const baseUrl = await startApp();

  // Act
  const postResponse = await postFaceVerify(baseUrl, {
    userId: USER_ID,
    method: "face-match-demo",
    liveness: true,
  });
  const postBody = await postResponse.json();
  const getBody = await (await fetch(`${baseUrl}/api/identity/${USER_ID}`)).json();

  // Assert
  expect(postResponse.status).toBe(200);
  expect(postBody.data).toMatchObject({ verified: true, method: "face-match-demo", liveness: true });
  expect(getBody.data).toEqual(postBody.data);
});

test("POST /api/identity/verify は許可していない方式やおかしな liveness を 400 で断る", async () => {
  // Arrange
  const baseUrl = await startApp();

  // Act
  const badMethod = await postFaceVerify(baseUrl, { userId: USER_ID, method: "admin", liveness: true });
  const badLiveness = await postFaceVerify(baseUrl, {
    userId: USER_ID,
    method: "face-match-demo",
    liveness: 1,
  });
  const status = await (await fetch(`${baseUrl}/api/identity/${USER_ID}`)).json();

  // Assert
  expect(badMethod.status).toBe(400);
  expect(await badMethod.json()).toEqual({ success: false, error: INVALID_METHOD_MESSAGE });
  expect(badLiveness.status).toBe(400);
  expect(status.data.verified).toBe(false);
});
