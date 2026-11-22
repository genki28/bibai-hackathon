import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, expect, test } from "vitest";
import { createApp } from "../src/app.js";
import type { AppConfig } from "../src/config.js";
import { createHelpRequestStore, parseHelpRequestInput } from "../src/help-requests/store.js";

const CONFIG: AppConfig = {
  channelSecret: "",
  channelAccessToken: "",
  liffId: "",
  port: 0,
};
// テスト用の架空のユーザー ID
const ELDER_ID = `U${"d".repeat(32)}`;
const NOW = new Date("2026-11-23T07:00:00Z");

const servers: Server[] = [];

async function startApp(): Promise<string> {
  const server = createApp(CONFIG).listen(0);
  servers.push(server);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

function postRequest(baseUrl: string, body: unknown): Promise<Response> {
  return fetch(`${baseUrl}/api/help-requests`, {
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

test("依頼の入力を確かめる。雪の量は省略すると「ふつう」になる", () => {
  // Arrange & Act & Assert
  expect(parseHelpRequestInput({ userId: ELDER_ID })).toEqual({
    userId: ELDER_ID,
    amount: "normal",
  });
  expect(parseHelpRequestInput({ userId: ELDER_ID, amount: "lots" })).toEqual({
    userId: ELDER_ID,
    amount: "lots",
  });
});

test("ユーザー ID や雪の量がおかしい入力は受け付けない", () => {
  // Arrange
  const invalid = [null, {}, { userId: "abc" }, { userId: ELDER_ID, amount: "huge" }];

  // Act & Assert
  invalid.forEach((input) => expect(parseHelpRequestInput(input)).toBeNull());
});

test("依頼を登録すると「待っている」状態で保存され、一覧に出る", () => {
  // Arrange
  const store = createHelpRequestStore();

  // Act
  const created = store.create({ userId: ELDER_ID, amount: "little" }, NOW);

  // Assert
  expect(created).toMatchObject({
    userId: ELDER_ID,
    amount: "little",
    status: "waiting",
    createdAt: "2026-11-23T07:00:00.000Z",
  });
  expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
  expect(store.listWaiting()).toEqual([created]);
});

test("同じ人が待っている依頼を出していたら、新しく作らず同じ依頼を返す", () => {
  // Arrange
  const store = createHelpRequestStore();
  const first = store.create({ userId: ELDER_ID, amount: "normal" }, NOW);

  // Act
  const second = store.create({ userId: ELDER_ID, amount: "lots" }, NOW);

  // Assert
  expect(second).toEqual(first);
  expect(store.listWaiting()).toHaveLength(1);
});

test("POST /api/help-requests で依頼を登録し、GET で一覧が取れる", async () => {
  // Arrange
  const baseUrl = await startApp();

  // Act
  const postResponse = await postRequest(baseUrl, { userId: ELDER_ID, amount: "lots" });
  const postBody = await postResponse.json();
  const listBody = await (await fetch(`${baseUrl}/api/help-requests`)).json();

  // Assert
  expect(postResponse.status).toBe(201);
  expect(postBody.success).toBe(true);
  expect(postBody.data).toMatchObject({ userId: ELDER_ID, amount: "lots", status: "waiting" });
  expect(listBody).toEqual({ success: true, data: [postBody.data] });
});

test("POST /api/help-requests は入力がおかしいと 400 と日本語のエラーを返す", async () => {
  // Arrange
  const baseUrl = await startApp();

  // Act
  const response = await postRequest(baseUrl, { userId: "not-a-user" });

  // Assert
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({
    success: false,
    error: "依頼の内容が正しくありません。",
  });
});
