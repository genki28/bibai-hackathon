import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, expect, test, vi } from "vitest";
import { createApp } from "../src/app.js";
import { isSupabaseConfigured, readConfig } from "../src/config.js";
import type { HelpRequest } from "../src/help-requests/model.js";
import { createMemoryHelpRequestRepository } from "../src/help-requests/repository.js";
import type { HelpRequestRepository } from "../src/help-requests/repository.js";
import { fromRow, fromVersionedRow, InvalidRowError, normalizeTimestamp, toRow } from "../src/help-requests/rows.js";
import { createHelpRequestStore } from "../src/help-requests/store.js";
import { toIdentityStatus } from "../src/identity/supabase-store.js";
import { createStores } from "../src/storage.js";
import { toRole } from "../src/users/supabase-store.js";

// テスト用の架空の値(本物のユーザー・キーではありません)
const ELDER_ID = `U${"d".repeat(32)}`;
const HELPER_A = `U${"a".repeat(32)}`;
const HELPER_B = `U${"b".repeat(32)}`;
const NOW = new Date("2026-11-23T07:00:00Z");

const SAMPLE: HelpRequest = {
  id: "00000000-0000-4000-8000-000000000001",
  userId: ELDER_ID,
  amount: "lots",
  name: "テスト",
  address: null,
  lat: 43.33,
  lng: 141.85,
  depth: null,
  tools: null,
  status: "done",
  createdAt: "2026-11-23T07:00:00.000Z",
  helpers: [{ userId: HELPER_A, displayName: "A", joinedAt: "2026-11-23T07:01:00.000Z", arrivedAt: null }],
  leaderUserId: HELPER_A,
  startedAt: "2026-11-23T07:05:00.000Z",
  finishedAt: "2026-11-23T07:35:00.000Z",
  cancelledAt: null,
  result: { minutes: 30, areaM2: 10, snowDepthM: 0.3, snowKg: 300, calories: 173, workPoints: 6000, finishedBy: HELPER_A },
  ratings: { [HELPER_A]: 5 },
  thankedAt: "2026-11-23T08:00:00.000Z",
};

const servers: Server[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  const closing = servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve)));
  await Promise.all(closing);
});

test("依頼を表の行に変えて戻すと、もとと同じになる(列名は snake_case)", () => {
  // Arrange & Act
  const row = toRow(SAMPLE);
  const back = fromRow(row);

  // Assert
  expect(row).toMatchObject({
    user_id: ELDER_ID,
    leader_user_id: HELPER_A,
    created_at: SAMPLE.createdAt,
    thanked_at: SAMPLE.thankedAt,
  });
  expect(back).toEqual(SAMPLE);
});

test("リーダーの列がない古い行は、リーダーなし(null)として読む", () => {
  // Arrange
  const { leader_user_id: _omitted, ...oldRow } = toRow(SAMPLE);

  // Act
  const request = fromRow(oldRow);

  // Assert
  expect(request.leaderUserId).toBeNull();
});

test("Postgres の時刻の形(+00:00 など)を、プログラムと同じ形にそろえる", () => {
  // Arrange
  const row = { ...toRow(SAMPLE), created_at: "2026-11-23 07:00:00+00", started_at: "2026-11-23T16:05:00+09:00" };

  // Act
  const request = fromRow(row);

  // Assert
  expect(request.createdAt).toBe("2026-11-23T07:00:00.000Z");
  expect(request.startedAt).toBe("2026-11-23T07:05:00.000Z");
  expect(normalizeTimestamp(null)).toBeNull();
});

test("表から読んだ行の状態や必要な列がおかしければ、エラーにする", () => {
  // Arrange
  const badStatus = { ...toRow(SAMPLE), status: "unknown" };
  const noUser = { ...toRow(SAMPLE), user_id: null };
  const noVersion = { ...toRow(SAMPLE) };

  // Act & Assert
  expect(() => fromRow(badStatus)).toThrow(InvalidRowError);
  expect(() => fromRow(noUser)).toThrow(InvalidRowError);
  expect(() => fromVersionedRow(noVersion)).toThrow(InvalidRowError);
  expect(fromVersionedRow({ ...toRow(SAMPLE), version: 3 }).version).toBe(3);
});

test("本人確認と役割の行を読み替える。行がなければ未確認・役割なし", () => {
  // Arrange & Act & Assert
  expect(toIdentityStatus(null)).toEqual({
    verified: false,
    verifiedAt: null,
    method: null,
    liveness: null,
  });
  expect(toIdentityStatus({ verified_at: "2026-11-22 10:00:00+00" })).toEqual({
    verified: true,
    verifiedAt: "2026-11-22T10:00:00.000Z",
    method: "mynumber-card-mock",
    liveness: false,
  });
  expect(
    toIdentityStatus({
      verified_at: "2026-11-22 10:00:00+00",
      method: "face-match-demo",
      liveness: true,
    }),
  ).toEqual({
    verified: true,
    verifiedAt: "2026-11-22T10:00:00.000Z",
    method: "face-match-demo",
    liveness: true,
  });
  expect(toRole({ role: "helper" })).toBe("helper");
  expect(toRole({ role: "admin" })).toBeNull();
  expect(toRole(null)).toBeNull();
});

test("URL と secret キーの両方があるときだけ Supabase を使い、なければメモリ", () => {
  // Arrange
  const onlyUrl = readConfig({ SUPABASE_URL: "https://example.supabase.co" });
  const both = readConfig({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_SECRET_KEY: "sb_secret_dummy" });

  // Act & Assert
  expect(isSupabaseConfigured(onlyUrl)).toBe(false);
  expect(createStores(onlyUrl).kind).toBe("memory");
  expect(isSupabaseConfigured(both)).toBe(true);
  expect(createStores(both).kind).toBe("supabase");
});

test("メモリ版の窓口は、読んだときと version が違えば書き換えない(楽観ロック)", async () => {
  // Arrange
  const repo = createMemoryHelpRequestRepository();
  await repo.insert({ ...SAMPLE, status: "waiting" });

  // Act
  const first = await repo.update({ ...SAMPLE, status: "accepted" }, 0);
  const stale = await repo.update({ ...SAMPLE, status: "cancelled" }, 0);
  const saved = await repo.findById(SAMPLE.id);

  // Assert
  expect(first).toBe(true);
  expect(stale).toBe(false);
  expect(saved).toMatchObject({ version: 1, request: { status: "accepted" } });
});

/** 書き込みの直前に、ほかの人が先に参加したことにする窓口。 */
function withRivalJoin(repo: HelpRequestRepository, times: number): HelpRequestRepository {
  let remaining = times;
  return {
    ...repo,
    update: async (request, expectedVersion) => {
      if (remaining > 0) {
        remaining -= 1;
        const current = await repo.findById(request.id);
        const rival = { userId: HELPER_B, displayName: "B", joinedAt: NOW.toISOString(), arrivedAt: null };
        const rivalRequest = { ...current!.request, status: "accepted" as const, helpers: [rival] };
        await repo.update(rivalRequest, current!.version);
      }
      return repo.update(request, expectedVersion);
    },
  };
}

test("同時に参加してぶつかったら、読み直してやり直し、2 人とも参加できる", async () => {
  // Arrange
  const store = createHelpRequestStore(withRivalJoin(createMemoryHelpRequestRepository(), 1));
  const { id } = await store.create({ userId: ELDER_ID, amount: "normal" }, NOW);

  // Act
  const result = await store.join(id, { userId: HELPER_A, displayName: "A" }, NOW);

  // Assert
  expect(result.ok && result.value.helpers.map((h) => h.userId)).toEqual([HELPER_B, HELPER_A]);
});

test("何度やり直してもぶつかるときは、409 と日本語のエラーを返す", async () => {
  // Arrange
  vi.spyOn(console, "error").mockImplementation(() => {});
  const memory = createMemoryHelpRequestRepository();
  const alwaysConflict: HelpRequestRepository = { ...memory, update: async () => false };
  const store = createHelpRequestStore(alwaysConflict);
  const { id } = await store.create({ userId: ELDER_ID, amount: "normal" }, NOW);

  // Act
  const result = await store.join(id, { userId: HELPER_A, displayName: "A" }, NOW);

  // Assert
  expect(result).toMatchObject({ ok: false, status: 409 });
  expect(!result.ok && result.error).toMatch(/重なりました/);
});

test("同じ人の依頼が同時に 2 つ保存されそうなときは、先に保存された方を返す", async () => {
  // Arrange
  const memory = createMemoryHelpRequestRepository();
  const winner = { ...SAMPLE, id: "00000000-0000-4000-8000-000000000002", status: "waiting" as const };
  // 最初の「探す」では見つからず、保存の直前にもう片方が保存した、という状況を作る
  const racing: HelpRequestRepository = {
    ...memory,
    insert: async (request) => {
      await memory.insert(winner);
      return memory.insert(request);
    },
  };
  const store = createHelpRequestStore(racing);

  // Act
  const created = await store.create({ userId: ELDER_ID, amount: "normal" }, NOW);

  // Assert
  expect(created.id).toBe(winner.id);
});

test("保存先でエラーが起きたら、ログに出して 500 と日本語のエラーを返す", async () => {
  // Arrange
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  const broken = createHelpRequestStore({
    ...createMemoryHelpRequestRepository(),
    listByStatus: async () => {
      throw new Error("つながらない");
    },
  });
  const config = readConfig({});
  const server = createApp(config, { helpRequestStore: broken }).listen(0);
  servers.push(server);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;

  // Act
  const response = await fetch(`http://127.0.0.1:${port}/api/help-requests`);

  // Assert
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ success: false, error: "サーバーでエラーが起きました。" });
  expect(logged).toHaveBeenCalled();
});
