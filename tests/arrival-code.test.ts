import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, test } from "vitest";
import { createApp } from "../src/app.js";
import type { AppConfig } from "../src/config.js";
import { ARRIVAL_CODE_LENGTH, arrivalCodeFor, helperForCode, isArrivalCodeInput } from "../src/help-requests/arrival-code.js";

const CONFIG: AppConfig = {
  channelSecret: "test-secret",
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
const REQUEST_ID = "6f1c2a4e-1b2c-4d3e-8f90-123456789abc";

describe("arrivalCodeFor(音の合言葉)", () => {
  test("4 桁の数字", () => {
    expect(arrivalCodeFor(REQUEST_ID, HELPER_A, "s")).toMatch(new RegExp(`^\\d{${ARRIVAL_CODE_LENGTH}}$`));
  });

  test("同じ依頼・同じ若者・同じ秘密なら、いつも同じ合言葉", () => {
    expect(arrivalCodeFor(REQUEST_ID, HELPER_A, "s")).toBe(arrivalCodeFor(REQUEST_ID, HELPER_A, "s"));
  });

  test("秘密が違えば、合言葉も変わる(依頼 ID と若者の ID だけでは作れない)", () => {
    const codes = new Set(["a", "b", "c", "d"].map((secret) => arrivalCodeFor(REQUEST_ID, HELPER_A, secret)));
    expect(codes.size).toBeGreaterThan(1);
  });

  test("となり合う数字は同じにならない(音で聞き分けるため)", () => {
    for (let i = 0; i < 200; i += 1) {
      const code = arrivalCodeFor(`${REQUEST_ID}-${i}`, HELPER_A, "s");
      for (let j = 1; j < code.length; j += 1) expect(code[j]).not.toBe(code[j - 1]);
    }
  });
});

describe("helperForCode(合言葉 → 若者)", () => {
  const helpers = [
    { userId: HELPER_A, arrivedAt: null },
    { userId: HELPER_B, arrivedAt: null },
  ];

  test("合言葉が合った若者の ID", () => {
    const code = arrivalCodeFor(REQUEST_ID, HELPER_B, "s");
    expect(helperForCode(REQUEST_ID, helpers, "s", code)).toBe(HELPER_B);
  });

  test("もう着いている若者の合言葉は、もう使えない", () => {
    const code = arrivalCodeFor(REQUEST_ID, HELPER_A, "s");
    const arrived = [{ userId: HELPER_A, arrivedAt: "2026-11-23T07:00:00Z" }];
    expect(helperForCode(REQUEST_ID, arrived, "s", code)).toBeNull();
  });
});

describe("isArrivalCodeInput(合言葉の形)", () => {
  test("4 桁の数字の文字だけを受け付ける", () => {
    expect(isArrivalCodeInput("0123")).toBe(true);
    expect(isArrivalCodeInput("123")).toBe(false);
    expect(isArrivalCodeInput(1234)).toBe(false);
    expect(isArrivalCodeInput("12a4")).toBe(false);
  });
});

const servers: Server[] = [];

async function startApp() {
  const server = createApp(CONFIG, { random: () => 0 }).listen(0);
  servers.push(server);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;
  const send = async (path: string, init?: RequestInit) => {
    const response = await fetch(`${baseUrl}${path}`, init);
    return { status: response.status, body: (await response.json()) as { success: boolean; data: any; error?: string } };
  };
  return {
    post: (path: string, body: unknown) =>
      send(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    get: (path: string) => send(path),
  };
}

type App = Awaited<ReturnType<typeof startApp>>;

/** 依頼を作り、若者 A が参加したところまで進める。依頼の URL を返す。 */
async function joinedRequest(app: App): Promise<string> {
  const created = await app.post("/api/help-requests", { userId: ELDER_ID, lat: 43.33, lng: 141.853 });
  const path = `/api/help-requests/${created.body.data.id}`;
  await app.post(`${path}/join`, { userId: HELPER_A, displayName: "若者A" });
  return path;
}

afterEach(async () => {
  const closing = servers.splice(0).map((s) => new Promise((resolve) => s.close(resolve)));
  await Promise.all(closing);
});

describe("合言葉の API", () => {
  test("参加した若者だけが、自分の合言葉を受け取れる", async () => {
    // Arrange
    const app = await startApp();
    const path = await joinedRequest(app);

    // Act
    const helper = await app.get(`${path}/arrival-code?userId=${HELPER_A}`);
    const elder = await app.get(`${path}/arrival-code?userId=${ELDER_ID}`);
    const outsider = await app.get(`${path}/arrival-code?userId=${OUTSIDER}`);

    // Assert
    expect(helper.status).toBe(200);
    expect(helper.body.data.code).toMatch(/^\d{4}$/);
    expect(elder.status).toBe(403);
    expect(outsider.status).toBe(403);
  });

  test("お年寄りのスマホが若者の合言葉を聞き取って送ると、その若者が到着になる", async () => {
    // Arrange
    const app = await startApp();
    const path = await joinedRequest(app);
    const { code } = (await app.get(`${path}/arrival-code?userId=${HELPER_A}`)).body.data;

    // Act
    const result = await app.post(`${path}/arrive-by-sound`, { userId: ELDER_ID, code });

    // Assert
    expect(result.status).toBe(200);
    const helperA = result.body.data.helpers.find((h: { userId: string }) => h.userId === HELPER_A);
    expect(helperA.arrivedAt).not.toBeNull();
  });

  test("合言葉が違えば、だれも到着にならない", async () => {
    // Arrange
    const app = await startApp();
    const path = await joinedRequest(app);
    const { code } = (await app.get(`${path}/arrival-code?userId=${HELPER_A}`)).body.data;
    const wrong = code === "0101" ? "1010" : "0101";

    // Act
    const result = await app.post(`${path}/arrive-by-sound`, { userId: ELDER_ID, code: wrong });

    // Assert
    expect(result.status).toBe(400);
    expect(result.body.error).toBe("合言葉が違います。");
  });

  test("若者が自分で合言葉を送っても、到着にならない(聞き取るのはお年寄りのスマホだけ)", async () => {
    // Arrange
    const app = await startApp();
    const path = await joinedRequest(app);
    const { code } = (await app.get(`${path}/arrival-code?userId=${HELPER_A}`)).body.data;

    // Act
    const result = await app.post(`${path}/arrive-by-sound`, { userId: HELPER_A, code });

    // Assert
    expect(result.status).toBe(403);
  });

  test("合言葉の形がおかしければ 400", async () => {
    const app = await startApp();
    const path = await joinedRequest(app);
    const result = await app.post(`${path}/arrive-by-sound`, { userId: ELDER_ID, code: "12" });
    expect(result.status).toBe(400);
  });
});
