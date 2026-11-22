import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, expect, test } from "vitest";
import { createApp } from "../src/app.js";
import type { AppConfig } from "../src/config.js";

const CONFIG: AppConfig = {
  channelSecret: "",
  channelAccessToken: "",
  liffId: "",
  port: 0,
  supabaseUrl: "",
  supabaseSecretKey: "",
};
// テスト用の架空のユーザー ID
const ELDER_ID = `U${"d".repeat(32)}`;
const HELPER_A = `U${"a".repeat(32)}`;
const HELPER_B = `U${"b".repeat(32)}`;
const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";
// 日本時間 2026-11-23 16:00。積雪は 40cm の予報にしておく(本物の天気予報は呼ばない)
const START = new Date("2026-11-23T07:00:00Z");
const FORECAST = {
  hourly: { time: ["2026-11-23T16:00", "2026-11-23T17:00"], snowfall: [0, 0], snow_depth: [0.4, 0.4] },
};

const servers: Server[] = [];

/** 時計を進められるアプリを起動する。 */
async function startApp() {
  let current = START;
  const server = createApp(CONFIG, {
    now: () => current,
    fetchForecast: async () => FORECAST,
  }).listen(0);
  servers.push(server);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;
  const advanceMinutes = (minutes: number): void => {
    current = new Date(current.getTime() + minutes * 60_000);
  };
  const post = async (path: string, body: unknown) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  const get = async (path: string) => {
    const response = await fetch(`${baseUrl}${path}`);
    return { status: response.status, body: await response.json() };
  };
  return { post, get, advanceMinutes };
}

async function createRequest(app: Awaited<ReturnType<typeof startApp>>): Promise<string> {
  const created = await app.post("/api/help-requests", {
    userId: ELDER_ID,
    name: "雪野 花子",
    address: "北海道美唄市東1条南2丁目",
  });
  return created.body.data.id;
}

afterEach(async () => {
  const closing = servers.splice(0).map((s) => new Promise((resolve) => s.close(resolve)));
  await Promise.all(closing);
});

test("依頼 → 参加 → 到着 → 開始 → 終了 → いいね → ランキング が API で通る", async () => {
  // Arrange
  const app = await startApp();
  const id = await createRequest(app);
  const path = `/api/help-requests/${id}`;

  // Act
  const joined = await app.post(`${path}/join`, { userId: HELPER_A, displayName: "ゆきお" });
  const arrived = await app.post(`${path}/arrive`, { userId: HELPER_A });
  const started = await app.post(`${path}/start`, { userId: HELPER_A });
  app.advanceMinutes(30);
  const finished = await app.post(`${path}/finish`, { userId: HELPER_A, areaM2: 25 });
  const thanked = await app.post(`${path}/thanks`, { userId: ELDER_ID, ratings: { [HELPER_A]: 5 } });
  const ranking = await app.get(`/api/ranking?period=daily&userId=${HELPER_A}`);

  // Assert
  expect(joined.body.data).toMatchObject({ status: "accepted", leaderUserId: HELPER_A, viewer: "helper" });
  expect(arrived.body.data.helpers[0].arrivedAt).not.toBeNull();
  expect(started.body.data.status).toBe("working");
  // 30 分 × 100 + (25㎡ × 0.4m × 100 = 1000kg) × 10
  expect(finished.body.data.result).toMatchObject({ minutes: 30, snowKg: 1000, workPoints: 13000 });
  expect(thanked.body.data.ratings).toEqual({ [HELPER_A]: 5 });
  expect(ranking.body).toEqual({
    success: true,
    data: [{ rank: 1, displayName: "ゆきお", points: 13500, isMe: true }],
  });
});

test("詳細は参加者と本人にはすべて、ほかの人にはおおまかにだけ見せる", async () => {
  // Arrange
  const app = await startApp();
  const id = await createRequest(app);
  await app.post(`/api/help-requests/${id}/join`, { userId: HELPER_A, displayName: "ゆきお" });

  // Act
  const asHelper = await app.get(`/api/help-requests/${id}?userId=${HELPER_A}`);
  const asElder = await app.get(`/api/help-requests/${id}?userId=${ELDER_ID}`);
  const asGuest = await app.get(`/api/help-requests/${id}?userId=${HELPER_B}`);

  // Assert
  expect(asHelper.body.data).toMatchObject({ name: "雪野 花子", viewer: "helper" });
  expect(asElder.body.data.viewer).toBe("elder");
  expect(asGuest.body.data).toMatchObject({ area: "東", viewer: "guest", helperCount: 1 });
  expect(asGuest.body.data).not.toHaveProperty("name");
});

test("お年寄りの待機画面用 API は、取り消すと null を返す", async () => {
  // Arrange
  const app = await startApp();
  const id = await createRequest(app);

  // Act
  const before = await app.get(`/api/help-requests/mine/${ELDER_ID}`);
  const cancelled = await app.post(`/api/help-requests/${id}/cancel`, { userId: ELDER_ID });
  const after = await app.get(`/api/help-requests/mine/${ELDER_ID}`);
  const list = await app.get("/api/help-requests");

  // Assert
  expect(before.body.data).toMatchObject({ id, status: "waiting", viewer: "elder" });
  expect(cancelled.body.data.status).toBe("cancelled");
  expect(after.body).toEqual({ success: true, data: null });
  expect(list.body.data).toEqual([]);
});

test("他人は取り消せず(403)、リーダー以外は開始できず(403)、いいねは 1 回だけ(409)", async () => {
  // Arrange
  const app = await startApp();
  const id = await createRequest(app);
  const path = `/api/help-requests/${id}`;
  await app.post(`${path}/join`, { userId: HELPER_A, displayName: "A" });
  await app.post(`${path}/join`, { userId: HELPER_B, displayName: "B" });

  // Act
  const cancelByOther = await app.post(`${path}/cancel`, { userId: HELPER_A });
  const startByMember = await app.post(`${path}/start`, { userId: HELPER_B });
  await app.post(`${path}/start`, { userId: HELPER_A });
  await app.post(`${path}/finish`, { userId: HELPER_B, areaM2: 10 });
  const firstThanks = await app.post(`${path}/thanks`, { userId: ELDER_ID, ratings: { [HELPER_B]: 3 } });
  const secondThanks = await app.post(`${path}/thanks`, { userId: ELDER_ID, ratings: { [HELPER_B]: 3 } });

  // Assert
  expect(cancelByOther).toEqual({ status: 403, body: { success: false, error: "依頼した本人だけができます。" } });
  expect(startByMember.status).toBe(403);
  expect(firstThanks.status).toBe(200);
  expect(secondThanks).toEqual({ status: 409, body: { success: false, error: "いいねは 1 回だけ送れます。" } });
});

test("入力がおかしいと 400、ない依頼は 404 を日本語のエラーで返す", async () => {
  // Arrange
  const app = await startApp();
  const id = await createRequest(app);

  // Act
  const badId = await app.get("/api/help-requests/not-an-id");
  const badQuery = await app.get(`/api/help-requests/${id}?userId=abc`);
  const missing = await app.get(`/api/help-requests/${UNKNOWN_ID}`);
  const joinMissing = await app.post(`/api/help-requests/${UNKNOWN_ID}/join`, { userId: HELPER_A, displayName: "A" });
  const noName = await app.post(`/api/help-requests/${id}/join`, { userId: HELPER_A });
  const hugeArea = await app.post(`/api/help-requests/${id}/finish`, { userId: HELPER_A, areaM2: 99999 });
  const badStars = await app.post(`/api/help-requests/${id}/thanks`, { userId: ELDER_ID, ratings: { [HELPER_A]: 0 } });
  const badPeriod = await app.get("/api/ranking?period=weekly");

  // Assert
  expect(badId.status).toBe(400);
  expect(badQuery.status).toBe(400);
  expect(missing).toEqual({ status: 404, body: { success: false, error: "依頼が見つかりません。" } });
  expect(joinMissing.status).toBe(404);
  expect(noName).toEqual({ status: 400, body: { success: false, error: "入力の内容が正しくありません。" } });
  expect(hugeArea.status).toBe(400);
  expect(badStars.status).toBe(400);
  expect(badPeriod.status).toBe(400);
  expect(badPeriod.body.success).toBe(false);
});

test("参加をやめる(leave)と募集中に戻り、参加していない人の到着は 403", async () => {
  // Arrange
  const app = await startApp();
  const id = await createRequest(app);
  const path = `/api/help-requests/${id}`;
  await app.post(`${path}/join`, { userId: HELPER_A, displayName: "A" });

  // Act
  const arriveByStranger = await app.post(`${path}/arrive`, { userId: HELPER_B });
  const left = await app.post(`${path}/leave`, { userId: HELPER_A });

  // Assert
  expect(arriveByStranger.status).toBe(403);
  expect(left.status).toBe(200);
  // やめた人から見ると、もう参加者ではないのでおおまかな形になる
  expect(left.body.data).toMatchObject({ status: "waiting", viewer: "guest", helperCount: 0 });
});

test("ランキングは period を省略すると total になる", async () => {
  // Arrange
  const app = await startApp();

  // Act
  const ranking = await app.get("/api/ranking");

  // Assert
  expect(ranking).toEqual({ status: 200, body: { success: true, data: [] } });
});
