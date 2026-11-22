import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, test } from "vitest";
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
const OUTSIDER = `U${"c".repeat(32)}`;
const START = new Date("2026-11-23T07:00:00Z");
const FORECAST = {
  hourly: { time: ["2026-11-23T16:00", "2026-11-23T17:00"], snowfall: [0, 0], snow_depth: [0.4, 0.4] },
};
/** 美唄の家と、そこから少し離れた若者の位置。 */
const HOME = { lat: 43.33, lng: 141.853 };
const NEAR = { lat: 43.334, lng: 141.848 };

type HelperView = { userId: string; location?: { lat: number; lng: number; accuracy: number | null; at: string } };
type Body = { success: boolean; data: { helpers: HelperView[] } | null; error?: string };

const servers: Server[] = [];

async function startApp() {
  let current = START;
  const server = createApp(CONFIG, {
    now: () => current,
    fetchForecast: async () => FORECAST,
    random: () => 0,
  }).listen(0);
  servers.push(server);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;
  const send = async (path: string, init?: RequestInit) => {
    const response = await fetch(`${baseUrl}${path}`, init);
    return { status: response.status, body: (await response.json()) as Body };
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

/** 位置つきの依頼を作り、A と B が参加したところまで進める。依頼の URL を返す。 */
async function joinedRequest(app: App): Promise<string> {
  const created = await app.post("/api/help-requests", { userId: ELDER_ID, ...HOME });
  const path = `/api/help-requests/${(created.body.data as unknown as { id: string }).id}`;
  await app.post(`${path}/join`, { userId: HELPER_A, displayName: "若者A" });
  await app.post(`${path}/join`, { userId: HELPER_B, displayName: "若者B" });
  return path;
}

const locationOf = (body: Body, userId: string) =>
  body.data?.helpers.find((h) => h.userId === userId)?.location;

afterEach(async () => {
  const closing = servers.splice(0).map((s) => new Promise((resolve) => s.close(resolve)));
  await Promise.all(closing);
});

describe("現在地の API(POST /api/help-requests/:id/location)", () => {
  test("参加者の位置を保存し、依頼したお年寄りの画面に出る", async () => {
    // Arrange
    const app = await startApp();
    const path = await joinedRequest(app);

    // Act
    const sent = await app.post(`${path}/location`, { userId: HELPER_A, ...NEAR, accuracy: 12 });
    const elder = await app.get(`/api/help-requests/mine/${ELDER_ID}`);

    // Assert
    expect(sent.status).toBe(200);
    expect(locationOf(elder.body, HELPER_A)).toEqual({ ...NEAR, accuracy: 12, at: START.toISOString() });
    expect(locationOf(elder.body, HELPER_B)).toBeUndefined();
  });

  test("誤差(accuracy)は省略できる(null で保存)", async () => {
    // Arrange
    const app = await startApp();
    const path = await joinedRequest(app);

    // Act
    await app.post(`${path}/location`, { userId: HELPER_A, ...NEAR });
    const elder = await app.get(`${path}?userId=${ELDER_ID}`);

    // Assert
    expect(locationOf(elder.body, HELPER_A)?.accuracy).toBeNull();
  });

  test.each([
    ["緯度が日本の外", { lat: 10, lng: NEAR.lng }],
    ["経度が日本の外", { lat: NEAR.lat, lng: 100 }],
    ["緯度がない", { lng: NEAR.lng }],
    ["緯度が文字", { lat: "43.3", lng: NEAR.lng }],
    ["誤差がマイナス", { ...NEAR, accuracy: -1 }],
  ])("%sなら 400", async (_label, position) => {
    // Arrange
    const app = await startApp();
    const path = await joinedRequest(app);

    // Act
    const sent = await app.post(`${path}/location`, { userId: HELPER_A, ...position });

    // Assert
    expect(sent.status).toBe(400);
  });

  test("参加していない人は 403", async () => {
    // Arrange
    const app = await startApp();
    const path = await joinedRequest(app);

    // Act
    const sent = await app.post(`${path}/location`, { userId: OUTSIDER, ...NEAR });

    // Assert
    expect(sent.status).toBe(403);
  });

  test("到着したあとは 409", async () => {
    // Arrange
    const app = await startApp();
    const path = await joinedRequest(app);
    await app.post(`${path}/arrive`, { userId: HELPER_A });

    // Act
    const sent = await app.post(`${path}/location`, { userId: HELPER_A, ...NEAR });

    // Assert
    expect(sent.status).toBe(409);
  });

  test("依頼が取り消されたあとは 409", async () => {
    // Arrange
    const app = await startApp();
    const path = await joinedRequest(app);
    await app.post(`${path}/cancel`, { userId: ELDER_ID });

    // Act
    const sent = await app.post(`${path}/location`, { userId: HELPER_A, ...NEAR });

    // Assert
    expect(sent.status).toBe(409);
  });

  test("雪かき中でも、まだ着いていない人の位置は受け付ける", async () => {
    // Arrange
    const app = await startApp();
    const path = await joinedRequest(app);
    await app.post(`${path}/arrive`, { userId: HELPER_A });
    await app.post(`${path}/start`, { userId: HELPER_A });

    // Act
    const sent = await app.post(`${path}/location`, { userId: HELPER_B, ...NEAR });
    const elder = await app.get(`/api/help-requests/mine/${ELDER_ID}`);

    // Assert
    expect(sent.status).toBe(200);
    expect(locationOf(elder.body, HELPER_B)).toMatchObject(NEAR);
  });
});

describe("現在地が消えるとき", () => {
  test("到着したら、その人の位置は消える", async () => {
    // Arrange
    const app = await startApp();
    const path = await joinedRequest(app);
    await app.post(`${path}/location`, { userId: HELPER_A, ...NEAR });

    // Act
    await app.post(`${path}/arrive`, { userId: HELPER_A });
    const elder = await app.get(`/api/help-requests/mine/${ELDER_ID}`);

    // Assert
    expect(locationOf(elder.body, HELPER_A)).toBeUndefined();
  });

  test("参加を取り消したら、位置も一緒に消える(参加者の記録ごと消える)", async () => {
    // Arrange
    const app = await startApp();
    const path = await joinedRequest(app);
    await app.post(`${path}/location`, { userId: HELPER_A, ...NEAR });

    // Act
    await app.post(`${path}/leave`, { userId: HELPER_A });
    await app.post(`${path}/join`, { userId: HELPER_A, displayName: "若者A" });
    const elder = await app.get(`/api/help-requests/mine/${ELDER_ID}`);

    // Assert
    expect(locationOf(elder.body, HELPER_A)).toBeUndefined();
  });
});

describe("現在地が見える人", () => {
  test("ほかの参加者(若者 B)には見えない", async () => {
    // Arrange
    const app = await startApp();
    const path = await joinedRequest(app);
    await app.post(`${path}/location`, { userId: HELPER_A, ...NEAR });

    // Act
    const byB = await app.get(`${path}?userId=${HELPER_B}`);
    const active = await app.get(`/api/help-requests/active/${HELPER_B}`);

    // Assert
    expect(locationOf(byB.body, HELPER_A)).toBeUndefined();
    expect(locationOf(active.body, HELPER_A)).toBeUndefined();
  });

  test("送った本人への返事にも、位置は入れない", async () => {
    // Arrange
    const app = await startApp();
    const path = await joinedRequest(app);

    // Act
    const sent = await app.post(`${path}/location`, { userId: HELPER_A, ...NEAR });

    // Assert
    expect(locationOf(sent.body, HELPER_A)).toBeUndefined();
  });

  test("参加していない人(ゲスト)と一覧には、参加者の情報ごと出ない", async () => {
    // Arrange
    const app = await startApp();
    const path = await joinedRequest(app);
    await app.post(`${path}/location`, { userId: HELPER_A, ...NEAR });

    // Act
    const guest = await app.get(`${path}?userId=${OUTSIDER}`);
    const list = await app.get("/api/help-requests");

    // Assert
    expect(JSON.stringify(guest.body)).not.toContain(String(NEAR.lat));
    expect(JSON.stringify(list.body)).not.toContain(String(NEAR.lat));
  });

  test("30 分より古い位置は、お年寄りにも出さない", async () => {
    // Arrange
    const app = await startApp();
    const path = await joinedRequest(app);
    await app.post(`${path}/location`, { userId: HELPER_A, ...NEAR });

    // Act
    app.advanceMinutes(30);
    const justInTime = await app.get(`/api/help-requests/mine/${ELDER_ID}`);
    app.advanceMinutes(1);
    const tooOld = await app.get(`/api/help-requests/mine/${ELDER_ID}`);

    // Assert
    expect(locationOf(justInTime.body, HELPER_A)).toBeDefined();
    expect(locationOf(tooOld.body, HELPER_A)).toBeUndefined();
  });
});
