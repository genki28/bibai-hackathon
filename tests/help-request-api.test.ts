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
  testMode: false,
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
    // 乱数 0 → リーダーは「到着した人のうち、参加した順の先頭」
    random: () => 0,
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
  // 開始前はリーダーがいない(王冠も出さない)。開始した瞬間に決まる
  expect(joined.body.data).toMatchObject({ status: "accepted", leaderUserId: null, viewer: "helper" });
  expect(arrived.body.data.helpers[0].arrivedAt).not.toBeNull();
  expect(started.body.data).toMatchObject({ status: "working", leaderUserId: HELPER_A });
  // 30 分 × 100 + (25㎡ × 0.4m × 100 = 1000kg) × 2
  expect(finished.body.data.result).toMatchObject({ minutes: 30, snowKg: 1000, workPoints: 5000 });
  expect(thanked.body.data.ratings).toEqual({ [HELPER_A]: 5 });
  expect(ranking.body).toEqual({
    success: true,
    data: [
      {
        rank: 1,
        displayName: "ゆきお",
        points: 5500,
        breakdown: { work: 5000, rating: 500, recruit: 0, reunion: 0 },
        isMe: true,
      },
    ],
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

test("他人は取り消せず(403)、到着前は開始できず(403)、リーダー以外は終了できず(403)、いいねは 1 回だけ(409)", async () => {
  // Arrange
  const app = await startApp();
  const id = await createRequest(app);
  const path = `/api/help-requests/${id}`;
  await app.post(`${path}/join`, { userId: HELPER_A, displayName: "A" });
  await app.post(`${path}/join`, { userId: HELPER_B, displayName: "B" });

  // Act
  const cancelByOther = await app.post(`${path}/cancel`, { userId: HELPER_A });
  const startBeforeArrival = await app.post(`${path}/start`, { userId: HELPER_B });
  await app.post(`${path}/arrive`, { userId: HELPER_A });
  await app.post(`${path}/arrive`, { userId: HELPER_B });
  // B が開始 → リーダーは A(乱数 0)
  const startByB = await app.post(`${path}/start`, { userId: HELPER_B });
  const finishByMember = await app.post(`${path}/finish`, { userId: HELPER_B, areaM2: 10 });
  const finishByLeader = await app.post(`${path}/finish`, { userId: HELPER_A, areaM2: 10 });
  const firstThanks = await app.post(`${path}/thanks`, { userId: ELDER_ID, ratings: { [HELPER_B]: 3 } });
  const secondThanks = await app.post(`${path}/thanks`, { userId: ELDER_ID, ratings: { [HELPER_B]: 3 } });

  // Assert
  expect(cancelByOther).toEqual({ status: 403, body: { success: false, error: "依頼した本人だけができます。" } });
  expect(startBeforeArrival).toEqual({ status: 403, body: { success: false, error: "到着してから開始してください。" } });
  expect(startByB.body.data).toMatchObject({ status: "working", leaderUserId: HELPER_A });
  expect(finishByMember).toEqual({
    status: 403,
    body: { success: false, error: "範囲に丸を付けて終われるのはリーダー(Aさん)だけです。" },
  });
  expect(finishByLeader.body.data.status).toBe("done");
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

test("参加を取り消すと本人確認も取り消され、次に参加するときはもう一度確認が必要になる", async () => {
  // Arrange
  const app = await startApp();
  const id = await createRequest(app);
  const path = `/api/help-requests/${id}`;
  await app.post(`${path}/join`, { userId: HELPER_A, displayName: "A" });
  await app.post("/api/identity/verify", { userId: HELPER_A, method: "face-match-demo", liveness: true });
  const before = await app.get(`/api/identity/${HELPER_A}`);

  // Act
  await app.post(`${path}/leave`, { userId: HELPER_A });
  const after = await app.get(`/api/identity/${HELPER_A}`);

  // Assert
  expect(before.body.data.verified).toBe(true);
  expect(after.body.data.verified).toBe(false);
});

test("参加の取り消しに失敗したときは、本人確認はそのまま残る", async () => {
  // Arrange: 参加していない人が取り消そうとする
  const app = await startApp();
  const id = await createRequest(app);
  await app.post("/api/identity/verify", { userId: HELPER_B, method: "face-match-demo", liveness: true });

  // Act
  const left = await app.post(`/api/help-requests/${id}/leave`, { userId: HELPER_B });
  const after = await app.get(`/api/identity/${HELPER_B}`);

  // Assert
  expect(left.status).toBe(403);
  expect(after.body.data.verified).toBe(true);
});

test("ランキングは period を省略すると total になる", async () => {
  // Arrange
  const app = await startApp();

  // Act
  const ranking = await app.get("/api/ranking");

  // Assert
  expect(ranking).toEqual({ status: 200, body: { success: true, data: [] } });
});

test("参加中の雪かき(active)は、参加 → 到着 → 開始 → 終了で同じ依頼を返し、1 時間を過ぎると null", async () => {
  // Arrange
  const app = await startApp();
  const id = await createRequest(app);
  const path = `/api/help-requests/${id}`;
  const active = (userId: string) => app.get(`/api/help-requests/active/${userId}`);

  // Act
  const before = await active(HELPER_A);
  await app.post(`${path}/join`, { userId: HELPER_A, displayName: "ゆきお" });
  const afterJoin = await active(HELPER_A);
  await app.post(`${path}/arrive`, { userId: HELPER_A });
  const afterArrive = await active(HELPER_A);
  await app.post(`${path}/start`, { userId: HELPER_A });
  const afterStart = await active(HELPER_A);
  const forOther = await active(HELPER_B);
  await app.post(`${path}/finish`, { userId: HELPER_A, areaM2: 25 });
  const afterFinish = await active(HELPER_A);
  app.advanceMinutes(61);
  const later = await active(HELPER_A);
  const invalid = await app.get("/api/help-requests/active/abc");

  // Assert
  expect(before.body).toEqual({ success: true, data: null });
  expect(afterJoin.body.data).toMatchObject({ id, status: "accepted", viewer: "helper" });
  expect(afterJoin.body.data.helpers[0].arrivedAt).toBeNull();
  expect(afterArrive.body.data.helpers[0].arrivedAt).not.toBeNull();
  expect(afterStart.body.data).toMatchObject({ id, status: "working", leaderUserId: HELPER_A });
  expect(forOther.body).toEqual({ success: true, data: null });
  expect(afterFinish.body.data).toMatchObject({ id, status: "done" });
  expect(later.body).toEqual({ success: true, data: null });
  expect(invalid.status).toBe(400);
});
