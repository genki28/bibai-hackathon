import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, expect, test } from "vitest";
import { createApp } from "../src/app.js";
import type { AppConfig } from "../src/config.js";
import { COMMUNITY_BASELINE, countCommunity } from "../src/help-requests/community.js";
import type { HelpRequest } from "../src/help-requests/model.js";
import { createHelpRequestStore } from "../src/help-requests/store.js";

const CONFIG: AppConfig = {
  channelSecret: "",
  channelAccessToken: "",
  liffId: "",
  port: 0,
  supabaseUrl: "",
  supabaseSecretKey: "",
  testMode: false,
};
// テスト用の架空のユーザー ID
const ELDER_1 = `U${"d".repeat(32)}`;
const ELDER_2 = `U${"e".repeat(32)}`;
const HELPER_A = `U${"a".repeat(32)}`;
const HELPER_B = `U${"b".repeat(32)}`;
const NOW = new Date("2026-11-23T07:00:00Z");

const servers: Server[] = [];

afterEach(async () => {
  const closing = servers.splice(0).map((s) => new Promise((resolve) => s.close(resolve)));
  await Promise.all(closing);
});

/** 終わった依頼 2 件(若者 B は両方に参加)と、参加者のいる終わっていない依頼 1 件を作る。 */
async function sampleRequests(): Promise<readonly HelpRequest[]> {
  // 乱数 0 → 到着した人のうち先頭(A)がリーダー
  const store = createHelpRequestStore(undefined, { random: () => 0 });
  const first = await store.create({ userId: ELDER_1, amount: "normal" }, NOW);
  await store.join(first.id, { userId: HELPER_A, displayName: "ゆきお" }, NOW);
  await store.join(first.id, { userId: HELPER_B, displayName: "あおい" }, NOW);
  await store.arrive(first.id, HELPER_A, NOW);
  await store.start(first.id, HELPER_A, NOW);
  await store.finish(first.id, { userId: HELPER_A, areaM2: 0 }, 0, NOW);

  const second = await store.create({ userId: ELDER_1, amount: "lots" }, NOW);
  await store.join(second.id, { userId: HELPER_B, displayName: "あおい" }, NOW);
  await store.arrive(second.id, HELPER_B, NOW);
  await store.start(second.id, HELPER_B, NOW);
  await store.finish(second.id, { userId: HELPER_B, areaM2: 0 }, 0, NOW);

  const ongoing = await store.create({ userId: ELDER_2, amount: "little" }, NOW);
  await store.join(ongoing.id, { userId: HELPER_A, displayName: "ゆきお" }, NOW);

  const all = await Promise.all([first.id, second.id, ongoing.id].map((id) => store.findById(id)));
  return all.filter((r): r is HelpRequest => r !== null);
}

test("仲間の数は、開始時の人数に、終わった依頼のお年寄りと若者を重複なしで足す", async () => {
  // Arrange
  const requests = await sampleRequests();

  // Act
  const gauge = countCommunity(requests);

  // Assert(お年寄り 1 + 若者 A・B = 3 人。終わっていない依頼のお年寄り 2 は数えない)
  expect(gauge).toEqual({ members: COMMUNITY_BASELINE + 3, goal: COMMUNITY_BASELINE * 2, baseline: COMMUNITY_BASELINE });
});

test("終わった依頼がなければ仲間はシーズン開始時の人数のままで、目標はその 2 倍", () => {
  // Arrange & Act
  const gauge = countCommunity([]);

  // Assert
  expect(gauge).toEqual({ members: 10, goal: 20, baseline: 10 });
});

test("GET /api/community は仲間の数・目標・開始時の数を返す", async () => {
  // Arrange
  const server = createApp(CONFIG, { now: () => NOW }).listen(0);
  servers.push(server);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;

  // Act
  const response = await fetch(`http://127.0.0.1:${port}/api/community`);

  // Assert
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    success: true,
    data: { members: 10, goal: 20, baseline: 10 },
  });
});
