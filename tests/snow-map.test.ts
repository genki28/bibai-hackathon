import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, test } from "vitest";
import { createApp } from "../src/app.js";
import type { AppConfig } from "../src/config.js";
import type { HelpRequest } from "../src/help-requests/model.js";
import { buildSnowMap, caloriesOf, teamsOf } from "../src/help-requests/snow-map.js";

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
const ELDER = `U${"d".repeat(32)}`;
const HELPER_A = `U${"a".repeat(32)}`;
const HELPER_B = `U${"b".repeat(32)}`;
const HELPER_C = `U${"c".repeat(32)}`;

/** 終わった依頼を作る。helpers は [userId, 名前, 測ったカロリー(なければ undefined)]。 */
function finished(id: string, helpers: Array<[string, string, number?]>, timeCalories = 100, finishedAt = "2026-11-23T03:00:00Z"): HelpRequest {
  return {
    id,
    userId: ELDER,
    amount: "normal",
    name: "見本",
    address: "北海道美唄市東1条南2丁目3-4",
    lat: 43.334567,
    lng: 141.856789,
    depth: null,
    tools: null,
    status: "done",
    createdAt: "2026-11-23T01:00:00Z",
    helpers: helpers.map(([userId, displayName, calories]) => ({
      userId,
      displayName,
      joinedAt: "2026-11-23T01:10:00Z",
      arrivedAt: "2026-11-23T01:30:00Z",
      ...(calories === undefined ? {} : { calories }),
    })),
    leaderUserId: helpers[0][0],
    startedAt: "2026-11-23T02:00:00Z",
    finishedAt,
    cancelledAt: null,
    result: { minutes: 30, areaM2: 40, snowDepthM: 0.3, snowKg: 1200, calories: timeCalories, workPoints: 3000, finishedBy: helpers[0][0] },
    ratings: null,
    thankedAt: null,
  };
}

describe("caloriesOf(1 人のカロリー)", () => {
  test("アプリで測ったカロリーがあれば、それを使う", () => {
    const r = finished("r1", [[HELPER_A, "A", 230]]);
    expect(caloriesOf(r, r.helpers[0])).toBe(230);
  });

  test("測っていなければ、時間から出したカロリー(結果の calories)", () => {
    const r = finished("r1", [[HELPER_A, "A"]], 150);
    expect(caloriesOf(r, r.helpers[0])).toBe(150);
  });
});

describe("buildSnowMap(美唄の雪山の地図)", () => {
  test("終わった依頼ごとに雪山を 1 つ作り、一緒にやった全員のカロリーを並べる", () => {
    const map = buildSnowMap([finished("r1", [[HELPER_A, "A", 200], [HELPER_B, "B", 120]])]);
    expect(map.piles).toHaveLength(1);
    expect(map.piles[0].members).toEqual([
      { displayName: "A", calories: 200 },
      { displayName: "B", calories: 120 },
    ]);
    expect(map.piles[0].totalCalories).toBe(320);
  });

  test("家の正確な位置は出さない(小数 3 桁 ≒ 100m に丸める)。住所・お年寄りの名前・ユーザー ID も出さない", () => {
    const map = buildSnowMap([finished("r1", [[HELPER_A, "A", 200]])]);
    const pile = map.piles[0];
    expect(pile.lat).toBe(43.335);
    expect(pile.lng).toBe(141.857);
    const text = JSON.stringify(map);
    expect(text).not.toContain("東1条南2丁目3-4");
    expect(text).not.toContain("見本");
    expect(text).not.toContain(HELPER_A);
  });

  test("全体の数: 雪山の数・関わった人の数(重なりなし)・カロリーの合計", () => {
    const map = buildSnowMap([
      finished("r1", [[HELPER_A, "A", 200], [HELPER_B, "B", 100]]),
      finished("r2", [[HELPER_A, "A", 50], [HELPER_C, "C", 70]]),
    ]);
    expect(map.totals).toEqual({ piles: 2, people: 3, calories: 420 });
  });

  test("位置のない依頼は、地図には出さないが合計には入れる", () => {
    const noPlace = { ...finished("r1", [[HELPER_A, "A", 80]]), lat: null, lng: null };
    const map = buildSnowMap([noPlace]);
    expect(map.piles).toHaveLength(0);
    expect(map.totals.calories).toBe(80);
  });
});

describe("teamsOf(自分が入ったチームのカロリー)", () => {
  test("自分が参加したチームだけを、新しい順に。チームの合計と、だれとやったか", () => {
    const old = finished("old", [[HELPER_A, "A", 100], [HELPER_B, "B", 60]], 100, "2026-11-20T03:00:00Z");
    const recent = finished("new", [[HELPER_A, "A", 40], [HELPER_C, "C", 30]], 100, "2026-11-23T03:00:00Z");
    const other = finished("other", [[HELPER_B, "B", 500]]);
    const teams = teamsOf([old, recent, other], HELPER_A);
    expect(teams.teams.map((t) => t.id)).toEqual(["new", "old"]);
    expect(teams.teams[0]).toMatchObject({ teamCalories: 70, myCalories: 40, members: ["A", "C"] });
    expect(teams.totalCalories).toBe(230);
    expect(teams.partners).toBe(2);
  });

  test("まだどこにも参加していなければ 0", () => {
    expect(teamsOf([], HELPER_A)).toEqual({ totalCalories: 0, teamCount: 0, partners: 0, teams: [] });
  });
});

const servers: Server[] = [];

afterEach(async () => {
  const closing = servers.splice(0).map((s) => new Promise((resolve) => s.close(resolve)));
  await Promise.all(closing);
});

describe("雪山の地図とチームの API・アプリで測ったカロリーを送る", () => {
  test("雪かき中にスコップの回数と一緒に送ったカロリーが、地図とチームに出る", async () => {
    // Arrange
    const server = createApp(CONFIG, { random: () => 0 }).listen(0);
    servers.push(server);
    await new Promise((resolve) => server.once("listening", resolve));
    const { port } = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${port}`;
    const post = (path: string, body: unknown) =>
      fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(
        async (r) => ({ status: r.status, body: await r.json() }),
      );
    const created = await post("/api/help-requests", { userId: ELDER, lat: 43.33, lng: 141.853 });
    const path = `/api/help-requests/${created.body.data.id}`;
    await post(`${path}/join`, { userId: HELPER_A, displayName: "若者A" });
    await post(`${path}/join`, { userId: HELPER_B, displayName: "若者B" });
    await post(`${path}/arrive`, { userId: HELPER_A });
    await post(`${path}/arrive`, { userId: HELPER_B });
    await post(`${path}/start`, { userId: HELPER_A });

    // Act
    const sent = await post(`${path}/scoops`, { userId: HELPER_A, count: 12, calories: 180 });
    await post(`${path}/scoops`, { userId: HELPER_B, count: 5, calories: 90 });
    await post(`${path}/finish`, { userId: HELPER_A, areaM2: 30 });
    const map = await fetch(`${base}/api/snow-map`).then((r) => r.json());
    const teams = await fetch(`${base}/api/teams/mine/${HELPER_A}`).then((r) => r.json());

    // Assert
    expect(sent.status).toBe(200);
    expect(map.data.piles[0].members).toEqual([
      { displayName: "若者A", calories: 180 },
      { displayName: "若者B", calories: 90 },
    ]);
    expect(teams.data.totalCalories).toBe(270);
    expect(teams.data.teams[0].members).toEqual(["若者A", "若者B"]);
  });

  test("カロリーの形がおかしければ 400", async () => {
    const server = createApp(CONFIG).listen(0);
    servers.push(server);
    await new Promise((resolve) => server.once("listening", resolve));
    const { port } = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${port}/api/help-requests/6f1c2a4e-1b2c-4d3e-8f90-123456789abc/scoops`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: HELPER_A, count: 1, calories: -5 }),
    });
    expect(response.status).toBe(400);
  });
});
