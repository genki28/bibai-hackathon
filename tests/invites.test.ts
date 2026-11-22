import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, expect, test } from "vitest";
import { createApp } from "../src/app.js";
import type { AppOptions } from "../src/app.js";
import type { AppConfig } from "../src/config.js";
import {
  decideReferral,
  generateInviteCode,
  INVITE_CODE_LENGTH,
  inviteCodeFromBytes,
  isValidInviteCode,
} from "../src/invites/model.js";
import { createInviteStore } from "../src/invites/store.js";
import { TEST_USERS } from "../src/test-mode/users.js";

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
const ELDER_ID = `U${"d".repeat(32)}`;
const HELPER_A = `U${"a".repeat(32)}`;
const HELPER_B = `U${"b".repeat(32)}`;
const NOW = new Date("2026-11-23T07:00:00Z");

const servers: Server[] = [];

afterEach(async () => {
  const closing = servers.splice(0).map((s) => new Promise((resolve) => s.close(resolve)));
  await Promise.all(closing);
});

async function startApp(config: AppConfig = CONFIG, options: AppOptions = {}) {
  let current = NOW;
  const server = createApp(config, {
    now: () => current,
    fetchForecast: async () => ({ hourly: { time: [], snowfall: [], snow_depth: [] } }),
    random: () => 0,
    ...options,
  }).listen(0);
  servers.push(server);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;
  const post = async (path: string, body?: unknown) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    return { status: response.status, body: await response.json() };
  };
  const get = async (path: string) => {
    const response = await fetch(`${baseUrl}${path}`);
    return { status: response.status, body: await response.json() };
  };
  const advanceMinutes = (minutes: number): void => {
    current = new Date(current.getTime() + minutes * 60_000);
  };
  return { post, get, advanceMinutes };
}

type App = Awaited<ReturnType<typeof startApp>>;

/** 依頼 → 参加 → 到着 → 開始 → (10 分後)リーダーが終了 までを API で通す。依頼 ID を返す。 */
async function finishTogether(app: App, helperIds: readonly string[]): Promise<string> {
  const created = await app.post("/api/help-requests", { userId: ELDER_ID });
  const path = `/api/help-requests/${created.body.data.id}`;
  for (const userId of helperIds) {
    await app.post(`${path}/join`, { userId, displayName: userId === HELPER_A ? "ゆきお" : "あおい" });
    await app.post(`${path}/arrive`, { userId });
  }
  const started = await app.post(`${path}/start`, { userId: helperIds.at(-1) });
  app.advanceMinutes(10);
  await app.post(`${path}/finish`, { userId: started.body.data.leaderUserId, areaM2: 0 });
  return created.body.data.id;
}

test("招待コードは決まった文字の 10 文字で、LINE のユーザー ID とは別のもの", () => {
  // Arrange & Act
  const code = generateInviteCode();

  // Assert
  expect(code).toHaveLength(INVITE_CODE_LENGTH);
  expect(isValidInviteCode(code)).toBe(true);
  expect(isValidInviteCode(HELPER_A)).toBe(false);
  expect(isValidInviteCode("abc")).toBe(false);
  expect(inviteCodeFromBytes(new Uint8Array(10))).toBe("aaaaaaaaaa");
});

test("招待の記録: 自分自身・持ち主のいないコード・すでに記録済みは記録しない", () => {
  // Arrange
  const existing = { inviteeUserId: HELPER_B, inviterUserId: ELDER_ID, createdAt: NOW.toISOString() };

  // Act & Assert
  expect(decideReferral({ inviteeUserId: HELPER_A, inviterUserId: HELPER_A, existing: null, now: NOW })).toEqual({
    ok: false,
    reason: "self",
  });
  expect(decideReferral({ inviteeUserId: HELPER_B, inviterUserId: null, existing: null, now: NOW })).toEqual({
    ok: false,
    reason: "unknown-code",
  });
  expect(decideReferral({ inviteeUserId: HELPER_B, inviterUserId: HELPER_A, existing, now: NOW })).toEqual({
    ok: false,
    reason: "already-recorded",
  });
  expect(decideReferral({ inviteeUserId: HELPER_B, inviterUserId: HELPER_A, existing: null, now: NOW })).toEqual({
    ok: true,
    referral: { inviteeUserId: HELPER_B, inviterUserId: HELPER_A, createdAt: NOW.toISOString() },
  });
});

test("同じ人の招待コードは 1 つだけで、招待は 1 人 1 回だけ記録する", async () => {
  // Arrange
  const store = createInviteStore();

  // Act
  const first = await store.getOrCreateCode(HELPER_A, NOW);
  const again = await store.getOrCreateCode(HELPER_A, NOW);
  const accepted = await store.accept(HELPER_B, first.code, NOW);
  const twice = await store.accept(HELPER_B, first.code, NOW);

  // Assert
  expect(again.code).toBe(first.code);
  expect(accepted).toEqual({ accepted: true, inviterUserId: HELPER_A });
  expect(twice).toEqual({ accepted: false, reason: "already-recorded" });
  expect(await store.listReferrals()).toHaveLength(1);
});

test("コードがたまたまほかの人とぶつかったら、作り直す", async () => {
  // Arrange: 1 回目は同じコード、2 回目は別のコードを返す
  const codes = ["aaaaaaaaaa", "aaaaaaaaaa", "bbbbbbbbbb"];
  const store = createInviteStore(undefined, { generateCode: () => codes.shift() ?? "cccccccccc" });

  // Act
  const forA = await store.getOrCreateCode(HELPER_A, NOW);
  const forB = await store.getOrCreateCode(HELPER_B, NOW);

  // Assert
  expect(forA.code).toBe("aaaaaaaaaa");
  expect(forB.code).toBe("bbbbbbbbbb");
});

test("招待 API: コードを作って返し、招待リンクで開いた人を 1 回だけ記録する(誘った人の ID は返さない)", async () => {
  // Arrange
  const app = await startApp();

  // Act
  const mine = await app.get(`/api/invites/mine?userId=${HELPER_A}`);
  const code = mine.body.data.code;
  const self = await app.post("/api/invites/accept", { userId: HELPER_A, code });
  const unknown = await app.post("/api/invites/accept", { userId: HELPER_B, code: "zzzzzzzzzz" });
  const accepted = await app.post("/api/invites/accept", { userId: HELPER_B, code });
  const twice = await app.post("/api/invites/accept", { userId: HELPER_B, code });
  const broken = await app.post("/api/invites/accept", { userId: HELPER_B, code: "<script>" });
  const badUser = await app.get("/api/invites/mine?userId=abc");

  // Assert
  expect(isValidInviteCode(code)).toBe(true);
  expect(self.body.data).toEqual({ accepted: false, reason: "self" });
  expect(unknown.body.data).toEqual({ accepted: false, reason: "unknown-code" });
  expect(accepted.body).toEqual({ success: true, data: { accepted: true } });
  expect(twice.body.data).toEqual({ accepted: false, reason: "already-recorded" });
  expect(broken.status).toBe(400);
  expect(badUser.status).toBe(400);
});

test("A が B を誘い、B が初めて終えると A に +500・B に +200。同じ 2 人でもう 1 回やると再会 +150", async () => {
  // Arrange
  const app = await startApp();
  const { code } = (await app.get(`/api/invites/mine?userId=${HELPER_A}`)).body.data;
  await app.post("/api/invites/accept", { userId: HELPER_B, code });

  // Act
  const firstId = await finishTogether(app, [HELPER_A, HELPER_B]);
  const secondId = await finishTogether(app, [HELPER_A, HELPER_B]);
  const ranking = await app.get(`/api/ranking?period=total&userId=${HELPER_A}`);
  const bFirst = await app.get(`/api/help-requests/${firstId}/points?userId=${HELPER_B}`);
  const bSecond = await app.get(`/api/help-requests/${secondId}/points?userId=${HELPER_B}`);
  const stranger = await app.get(`/api/help-requests/${secondId}/points?userId=${ELDER_ID}`);

  // Assert: 10 分 × 100 = 1,000 pt を 2 回
  expect(ranking.body.data).toEqual([
    {
      rank: 1,
      displayName: "ゆきお",
      points: 2650,
      breakdown: { work: 2000, rating: 0, recruit: 500, reunion: 150 },
      isMe: true,
    },
    {
      rank: 2,
      displayName: "あおい",
      points: 2350,
      breakdown: { work: 2000, rating: 0, recruit: 200, reunion: 150 },
      isMe: false,
    },
  ]);
  expect(bFirst.body.data).toMatchObject({ firstFinishBonus: 200, reunion: { points: 0, partners: [] }, total: 1200 });
  expect(bSecond.body.data).toMatchObject({ firstFinishBonus: 0, reunion: { points: 150, partners: ["ゆきお"] } });
  expect(stranger.status).toBe(403);
});

test("テストモードの reset は、テスト用の利用者の招待コードと招待の記録も消す", async () => {
  // Arrange
  const [, testA, testB] = TEST_USERS.map((u) => u.userId);
  const inviteStore = createInviteStore();
  const testCode = await inviteStore.getOrCreateCode(testA ?? "", NOW);
  await inviteStore.accept(testB ?? "", testCode.code, NOW);
  const realCode = await inviteStore.getOrCreateCode(HELPER_A, NOW);
  await inviteStore.accept(HELPER_B, realCode.code, NOW);
  const app = await startApp({ ...CONFIG, testMode: true }, { inviteStore });

  // Act
  const reset = await app.post("/api/test/reset");

  // Assert: テスト用の人のコード 1 件と招待 1 件だけが消え、ふつうの人のものは残る
  expect(reset.body.data.deletedInvites).toBe(2);
  expect(await inviteStore.listReferrals()).toEqual([
    { inviteeUserId: HELPER_B, inviterUserId: HELPER_A, createdAt: NOW.toISOString() },
  ]);
  expect((await inviteStore.getOrCreateCode(HELPER_A, NOW)).code).toBe(realCode.code);
});
