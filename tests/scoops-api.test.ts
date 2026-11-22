import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, test } from "vitest";
import { createApp } from "../src/app.js";
import type { AppConfig } from "../src/config.js";
import { MAX_SCOOPS } from "../src/help-requests/model.js";

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
const OUTSIDER = `U${"c".repeat(32)}`;
const START = new Date("2026-11-23T07:00:00Z");
// 積雪は 40cm の予報にしておく(本物の天気予報は呼ばない)
const FORECAST = {
  hourly: { time: ["2026-11-23T16:00", "2026-11-23T17:00"], snowfall: [0, 0], snow_depth: [0.4, 0.4] },
};

const servers: Server[] = [];

async function startApp() {
  let current = START;
  const server = createApp(CONFIG, {
    now: () => current,
    fetchForecast: async () => FORECAST,
    random: () => 0, // リーダーは参加した順の先頭(A)
  }).listen(0);
  servers.push(server);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;
  const send = async (path: string, init?: RequestInit) => {
    const response = await fetch(`${baseUrl}${path}`, init);
    return { status: response.status, body: await response.json() };
  };
  return {
    post: (path: string, body: unknown) =>
      send(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    get: (path: string) => send(path),
    advanceMinutes: (minutes: number) => {
      current = new Date(current.getTime() + minutes * 60_000);
    },
  };
}

type App = Awaited<ReturnType<typeof startApp>>;

/** 依頼を作り、A と B が参加・到着して、雪かきを始めたところまで進める。 */
async function startWorking(app: App): Promise<string> {
  const created = await app.post("/api/help-requests", { userId: ELDER_ID, address: "北海道美唄市東1条南2丁目" });
  const path = `/api/help-requests/${created.body.data.id}`;
  await app.post(`${path}/join`, { userId: HELPER_A, displayName: "ゆきお" });
  await app.post(`${path}/join`, { userId: HELPER_B, displayName: "こゆき" });
  await app.post(`${path}/arrive`, { userId: HELPER_A });
  await app.post(`${path}/arrive`, { userId: HELPER_B });
  await app.post(`${path}/start`, { userId: HELPER_A });
  return path;
}

const scoopsOf = (body: { data: { helpers: { userId: string; scoops?: number }[] } }, userId: string) =>
  body.data.helpers.find((h) => h.userId === userId)?.scoops;

afterEach(async () => {
  const closing = servers.splice(0).map((s) => new Promise((resolve) => s.close(resolve)));
  await Promise.all(closing);
});

describe("スコップ計の回数の API(POST /api/help-requests/:id/scoops)", () => {
  test("雪かき中の参加者の回数を残し、前より少ない回数では書き換えない", async () => {
    // Arrange
    const app = await startApp();
    const path = await startWorking(app);

    // Act
    const first = await app.post(`${path}/scoops`, { userId: HELPER_A, count: 12 });
    const fewer = await app.post(`${path}/scoops`, { userId: HELPER_A, count: 5 });
    const more = await app.post(`${path}/scoops`, { userId: HELPER_A, count: 30 });

    // Assert
    expect(first.status).toBe(200);
    expect(scoopsOf(first.body, HELPER_A)).toBe(12);
    expect(scoopsOf(first.body, HELPER_B)).toBeUndefined();
    expect(scoopsOf(fewer.body, HELPER_A)).toBe(12);
    expect(scoopsOf(more.body, HELPER_A)).toBe(30);
  });

  test("回数がおかしい(負・小数・上限超え・文字)と 400", async () => {
    // Arrange
    const app = await startApp();
    const path = await startWorking(app);

    // Act
    const results = await Promise.all(
      [-1, 1.5, MAX_SCOOPS + 1, "10", null].map((count) => app.post(`${path}/scoops`, { userId: HELPER_A, count })),
    );
    const badUser = await app.post(`${path}/scoops`, { userId: "abc", count: 1 });

    // Assert
    results.forEach((result) => expect(result.status).toBe(400));
    expect(badUser.status).toBe(400);
  });

  test("参加していない人は 403、ない依頼は 404", async () => {
    // Arrange
    const app = await startApp();
    const path = await startWorking(app);

    // Act
    const outsider = await app.post(`${path}/scoops`, { userId: OUTSIDER, count: 3 });
    const elder = await app.post(`${path}/scoops`, { userId: ELDER_ID, count: 3 });
    const missing = await app.post("/api/help-requests/00000000-0000-4000-8000-000000000000/scoops", {
      userId: HELPER_A,
      count: 3,
    });

    // Assert
    expect(outsider).toEqual({ status: 403, body: { success: false, error: "この依頼に参加していません。" } });
    expect(elder.status).toBe(403);
    expect(missing.status).toBe(404);
  });

  test("雪かき中でない(始まる前・終わったあと)と 409", async () => {
    // Arrange
    const app = await startApp();
    const created = await app.post("/api/help-requests", { userId: ELDER_ID });
    const path = `/api/help-requests/${created.body.data.id}`;
    await app.post(`${path}/join`, { userId: HELPER_A, displayName: "ゆきお" });
    await app.post(`${path}/arrive`, { userId: HELPER_A });

    // Act
    const beforeStart = await app.post(`${path}/scoops`, { userId: HELPER_A, count: 3 });
    await app.post(`${path}/start`, { userId: HELPER_A });
    await app.post(`${path}/finish`, { userId: HELPER_A, areaM2: 10 });
    const afterFinish = await app.post(`${path}/scoops`, { userId: HELPER_A, count: 3 });

    // Assert
    expect(beforeStart).toEqual({ status: 409, body: { success: false, error: "雪かき中だけ記録できます。" } });
    expect(afterFinish.status).toBe(409);
  });

  test("お疲れ様の画面用 API で自分の回数とみんなの合計を返し、ポイントは変わらない", async () => {
    // Arrange: 同じ流れで、スコップ計を使った依頼と使わなかった依頼を比べる
    const withScoops = await startApp();
    const withoutScoops = await startApp();
    const pathWith = await startWorking(withScoops);
    const pathWithout = await startWorking(withoutScoops);
    await withScoops.post(`${pathWith}/scoops`, { userId: HELPER_A, count: 40 });
    await withScoops.post(`${pathWith}/scoops`, { userId: HELPER_B, count: 25 });
    withScoops.advanceMinutes(30);
    withoutScoops.advanceMinutes(30);
    await withScoops.post(`${pathWith}/finish`, { userId: HELPER_A, areaM2: 25 });
    await withoutScoops.post(`${pathWithout}/finish`, { userId: HELPER_A, areaM2: 25 });

    // Act
    const pointsWith = await withScoops.get(`${pathWith}/points?userId=${HELPER_B}`);
    const pointsWithout = await withoutScoops.get(`${pathWithout}/points?userId=${HELPER_B}`);
    const rankingWith = await withScoops.get(`/api/ranking?userId=${HELPER_A}`);
    const rankingWithout = await withoutScoops.get(`/api/ranking?userId=${HELPER_A}`);

    // Assert
    expect(pointsWith.body.data.scoops).toEqual({ mine: 25, total: 65 });
    expect(pointsWithout.body.data.scoops).toEqual({ mine: 0, total: 0 });
    expect(pointsWith.body.data.total).toBe(pointsWithout.body.data.total);
    expect(pointsWith.body.data.workPoints).toBe(5000);
    expect(rankingWith.body.data).toEqual(rankingWithout.body.data);
  });
});
