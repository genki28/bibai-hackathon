import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, expect, test } from "vitest";
import { createApp } from "../src/app.js";
import type { AppOptions } from "../src/app.js";
import { readConfig } from "../src/config.js";
import type { AppConfig } from "../src/config.js";
import { createMemoryHelpRequestRepository } from "../src/help-requests/repository.js";
import { createHelpRequestStore } from "../src/help-requests/store.js";
import { createIdentityStore, isValidUserId } from "../src/identity/store.js";
import { TEST_USERS } from "../src/test-mode/users.js";
import { createRoleStore } from "../src/users/store.js";

const BASE_CONFIG: AppConfig = {
  channelSecret: "",
  channelAccessToken: "",
  liffId: "",
  port: 0,
  supabaseUrl: "",
  supabaseSecretKey: "",
  testMode: false,
};
const TEST_ON: AppConfig = { ...BASE_CONFIG, testMode: true };

// テスト用の架空の(テスト用の利用者ではない)ふつうの人
const REAL_ELDER = `U${"d".repeat(32)}`;
const REAL_HELPER = `U${"f".repeat(32)}`;
const [TEST_ELDER, TEST_HELPER] = TEST_USERS.map((user) => user.userId);
const NOW = new Date("2026-11-23T07:00:00Z");

const servers: Server[] = [];

afterEach(async () => {
  const closing = servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve)));
  await Promise.all(closing);
});

async function startApp(config: AppConfig, options: AppOptions = {}): Promise<string> {
  const server = createApp(config, options).listen(0);
  servers.push(server);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

/** ふつうの人の依頼・テスト用の人の依頼・ふつうの依頼にテスト用の人が参加したもの、を用意する。 */
async function seedStores() {
  const helpRequestStore = createHelpRequestStore(createMemoryHelpRequestRepository());
  const identityStore = createIdentityStore();
  const roleStore = createRoleStore();

  const realOnly = await helpRequestStore.create({ userId: REAL_ELDER, amount: "normal" }, NOW);
  await helpRequestStore.join(realOnly.id, { userId: REAL_HELPER, displayName: "ふつうの若者" }, NOW);
  const byTestElder = await helpRequestStore.create({ userId: TEST_ELDER, amount: "lots" }, NOW);
  const otherElder = `U${"e".repeat(32)}`;
  const joinedByTest = await helpRequestStore.create({ userId: otherElder, amount: "little" }, NOW);
  await helpRequestStore.join(joinedByTest.id, { userId: TEST_HELPER, displayName: "若者A(テスト)" }, NOW);

  await identityStore.markVerified(REAL_HELPER, NOW);
  await identityStore.markVerified(TEST_HELPER, NOW);
  await roleStore.setRole(REAL_ELDER, "elder");
  await roleStore.setRole(TEST_ELDER, "elder");

  return {
    stores: { helpRequestStore, identityStore, roleStore },
    ids: { realOnly: realOnly.id, byTestElder: byTestElder.id, joinedByTest: joinedByTest.id },
  };
}

test("TEST_MODE が \"true\" のときだけテストモードになる", () => {
  // Arrange
  const envs = [{}, { TEST_MODE: "false" }, { TEST_MODE: "TRUE" }, { TEST_MODE: " true " }];

  // Act
  const results = envs.map((env) => readConfig(env).testMode);

  // Assert
  expect(results).toEqual([false, false, false, true]);
});

test("テスト用の利用者の ID は LINE のユーザー ID の形で、重ならない", () => {
  // Arrange
  const ids = TEST_USERS.map((user) => user.userId);

  // Act
  const allValid = ids.every(isValidUserId);

  // Assert
  expect(allValid).toBe(true);
  expect(new Set(ids).size).toBe(ids.length);
  expect(TEST_USERS.some((user) => user.role === "elder")).toBe(true);
  expect(TEST_USERS.filter((user) => user.role === "helper").length).toBeGreaterThanOrEqual(2);
});

test("テストモードがオフなら、/api/config は testMode: false でテスト用の利用者を返さない", async () => {
  // Arrange
  const baseUrl = await startApp(BASE_CONFIG);

  // Act
  const body = await (await fetch(`${baseUrl}/api/config`)).json();

  // Assert
  expect(body).toEqual({ success: true, data: { liffId: "", testMode: false, testUsers: [] } });
});

test("テストモードがオンなら、/api/config は testMode: true とテスト用の利用者を返す", async () => {
  // Arrange
  const baseUrl = await startApp(TEST_ON);

  // Act
  const body = await (await fetch(`${baseUrl}/api/config`)).json();

  // Assert
  expect(body.data.testMode).toBe(true);
  expect(body.data.testUsers).toEqual(TEST_USERS);
});

test("テストモードがオフなら、POST /api/test/reset は 404 で何も消さない", async () => {
  // Arrange
  const { stores, ids } = await seedStores();
  const baseUrl = await startApp(BASE_CONFIG, stores);

  // Act
  const response = await fetch(`${baseUrl}/api/test/reset`, { method: "POST" });

  // Assert
  expect(response.status).toBe(404);
  expect(await stores.helpRequestStore.findById(ids.byTestElder)).not.toBeNull();
  expect((await stores.identityStore.getStatus(TEST_HELPER)).verified).toBe(true);
});

test("テストモードがオンなら、POST /api/test/reset はテスト用の利用者が関わったデータだけを消す", async () => {
  // Arrange
  const { stores, ids } = await seedStores();
  const baseUrl = await startApp(TEST_ON, stores);

  // Act
  const response = await fetch(`${baseUrl}/api/test/reset`, { method: "POST" });
  const body = await response.json();

  // Assert: テスト用の人の依頼・テスト用の人が参加した依頼・役割・本人確認は消える
  expect(response.status).toBe(200);
  expect(body.data.deletedRequests).toBe(2);
  expect(await stores.helpRequestStore.findById(ids.byTestElder)).toBeNull();
  expect(await stores.helpRequestStore.findById(ids.joinedByTest)).toBeNull();
  expect((await stores.identityStore.getStatus(TEST_HELPER)).verified).toBe(false);
  expect(await stores.roleStore.getRole(TEST_ELDER)).toBeNull();
  // Assert: ふつうの人のデータは残る
  expect(await stores.helpRequestStore.findById(ids.realOnly)).not.toBeNull();
  expect((await stores.identityStore.getStatus(REAL_HELPER)).verified).toBe(true);
  expect(await stores.roleStore.getRole(REAL_ELDER)).toBe("elder");
});
