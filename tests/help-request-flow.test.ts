import { expect, test } from "vitest";
import {
  parseFinishInput,
  parseHelpRequestInput,
  parseJoinInput,
  parseThanksInput,
} from "../src/help-requests/inputs.js";
import { MAX_HELPERS } from "../src/help-requests/model.js";
import type { HelpRequest, Result } from "../src/help-requests/model.js";
import { createHelpRequestStore } from "../src/help-requests/store.js";
import { roughArea, toPublicView } from "../src/help-requests/views.js";

// テスト用の架空のユーザー ID
const ELDER_ID = `U${"d".repeat(32)}`;
const userIdOf = (n: number): string => `U${String(n).padStart(32, "0")}`;
const HELPER_A = userIdOf(1);
const HELPER_B = userIdOf(2);
const NOW = new Date("2026-11-23T07:00:00Z");
const minutesLater = (minutes: number): Date => new Date(NOW.getTime() + minutes * 60_000);

/** 成功のはずの結果から依頼を取り出す。失敗していたらテストを落とす。 */
function valueOf(result: Result<HelpRequest>): HelpRequest {
  if (!result.ok) throw new Error(`失敗しました: ${result.error}`);
  return result.value;
}

/** 乱数をいつも 0 にして、リーダーは「到着した人のうち、参加した順の先頭」に決まるようにする。 */
const FIRST_CANDIDATE = () => 0;

async function setUp() {
  const store = createHelpRequestStore(undefined, { random: FIRST_CANDIDATE });
  const request = await store.create({ userId: ELDER_ID, amount: "normal" }, NOW);
  return { store, id: request.id };
}

test("フォームの任意の項目(名前・住所・位置など)も受け付け、空の項目は省く", () => {
  // Arrange
  const raw = {
    userId: ELDER_ID,
    name: " 雪野 花子 ",
    address: "北海道美唄市東1条南2丁目",
    lat: 43.33,
    lng: 141.85,
    depth: "knee",
    tools: "",
  };

  // Act
  const input = parseHelpRequestInput(raw);

  // Assert
  expect(input).toEqual({
    userId: ELDER_ID,
    amount: "normal",
    name: "雪野 花子",
    address: "北海道美唄市東1条南2丁目",
    lat: 43.33,
    lng: 141.85,
    depth: "knee",
  });
});

test("緯度だけ・範囲外の位置・長すぎる名前は受け付けない", () => {
  // Arrange
  const invalid = [
    { userId: ELDER_ID, lat: 43.3 },
    { userId: ELDER_ID, lat: 100, lng: 141 },
    { userId: ELDER_ID, name: "あ".repeat(41) },
    { userId: ELDER_ID, tools: 123 },
  ];

  // Act & Assert
  invalid.forEach((raw) => expect(parseHelpRequestInput(raw)).toBeNull());
});

test("参加・終了・いいねの入力を確かめる", () => {
  // Arrange & Act & Assert
  expect(parseJoinInput({ userId: HELPER_A, displayName: "ゆきお" })).toEqual({
    userId: HELPER_A,
    displayName: "ゆきお",
  });
  expect(parseJoinInput({ userId: HELPER_A, displayName: "" })).toBeNull();
  expect(parseFinishInput({ userId: HELPER_A, areaM2: 5001 })).toBeNull();
  expect(parseFinishInput({ userId: HELPER_A, areaM2: 5000 })).toEqual({ userId: HELPER_A, areaM2: 5000 });
  expect(parseFinishInput({ userId: HELPER_A, areaM2: -1 })).toBeNull();
  expect(parseThanksInput({ userId: ELDER_ID, ratings: { [HELPER_A]: 6 } })).toBeNull();
  expect(parseThanksInput({ userId: ELDER_ID, ratings: {} })).toBeNull();
  expect(parseThanksInput({ userId: ELDER_ID, ratings: { [HELPER_A]: 3 } })).toEqual({
    userId: ELDER_ID,
    ratings: { [HELPER_A]: 3 },
  });
});

test("参加 → 到着 → 開始 → 終了 と状態が進み、もとの依頼は書き換わらない", async () => {
  // Arrange
  const { store, id } = await setUp();
  const before = await store.findById(id);

  // Act
  const joined = valueOf(await store.join(id, { userId: HELPER_A, displayName: "ゆきお" }, NOW));
  const arrived = valueOf(await store.arrive(id, HELPER_A, minutesLater(5)));
  const started = valueOf(await store.start(id, HELPER_A, minutesLater(6)));
  const finished = valueOf(await store.finish(id, { userId: HELPER_A, areaM2: 20 }, 0.5, minutesLater(36)));

  // Assert
  expect(before?.status).toBe("waiting");
  expect(before?.helpers).toEqual([]);
  expect(joined.status).toBe("accepted");
  expect(arrived.helpers[0]?.arrivedAt).toBe(minutesLater(5).toISOString());
  expect(started).toMatchObject({
    status: "working",
    startedAt: minutesLater(6).toISOString(),
    leaderUserId: HELPER_A,
  });
  expect(finished.status).toBe("done");
  expect(finished.result).toEqual({
    minutes: 30,
    areaM2: 20,
    snowDepthM: 0.5,
    snowKg: 1000,
    calories: 173,
    workPoints: 30 * 100 + 1000 * 2,
    finishedBy: HELPER_A,
  });
});

test("開始は到着した人ならだれでも押せて、到着していない人は押せない", async () => {
  // Arrange
  const { store, id } = await setUp();
  await store.join(id, { userId: HELPER_A, displayName: "A" }, NOW);
  await store.join(id, { userId: HELPER_B, displayName: "B" }, NOW);
  await store.arrive(id, HELPER_B, NOW);

  // Act
  const byNotArrived = await store.start(id, HELPER_A, NOW);
  const byArrived = await store.start(id, HELPER_B, NOW);

  // Assert
  expect(byNotArrived).toMatchObject({ ok: false, status: 403, error: "到着してから開始してください。" });
  expect(valueOf(byArrived).status).toBe("working");
});

test("開始前はリーダーがいない。開始した瞬間に、到着した人の中からリーダーが決まる", async () => {
  // Arrange: A は向かっている途中、B と C は到着済み。乱数 0.99 → 候補(B, C)の最後 = C
  const store = createHelpRequestStore(undefined, { random: () => 0.99 });
  const { id } = await store.create({ userId: ELDER_ID, amount: "normal" }, NOW);
  const HELPER_C = userIdOf(3);
  await store.join(id, { userId: HELPER_A, displayName: "A" }, NOW);
  await store.join(id, { userId: HELPER_B, displayName: "B" }, NOW);
  await store.join(id, { userId: HELPER_C, displayName: "C" }, NOW);
  await store.arrive(id, HELPER_B, NOW);
  await store.arrive(id, HELPER_C, NOW);
  const before = await store.findById(id);

  // Act
  const started = valueOf(await store.start(id, HELPER_B, NOW));

  // Assert
  expect(before?.leaderUserId).toBeNull();
  expect(started.leaderUserId).toBe(HELPER_C);
});

test("範囲に丸を付けて終われるのはリーダーだけで、ほかの人は 403(リーダーの名前つき)", async () => {
  // Arrange: 乱数 0 → 到着した人のうち参加した順の先頭(A)がリーダー
  const { store, id } = await setUp();
  await store.join(id, { userId: HELPER_A, displayName: "ゆきお" }, NOW);
  await store.join(id, { userId: HELPER_B, displayName: "あおい" }, NOW);
  await store.arrive(id, HELPER_A, NOW);
  await store.arrive(id, HELPER_B, NOW);
  await store.start(id, HELPER_B, NOW);

  // Act
  const byMember = await store.finish(id, { userId: HELPER_B, areaM2: 10 }, 0.3, minutesLater(10));
  const byLeader = await store.finish(id, { userId: HELPER_A, areaM2: 10 }, 0.3, minutesLater(10));
  const afterDone = await store.finish(id, { userId: HELPER_B, areaM2: 10 }, 0.3, minutesLater(11));

  // Assert
  expect(byMember).toMatchObject({
    ok: false,
    status: 403,
    error: "範囲に丸を付けて終われるのはリーダー(ゆきおさん)だけです。",
  });
  expect(valueOf(byLeader).result?.finishedBy).toBe(HELPER_A);
  // 終わったあとは、だれが押しても同じ結果を返す(画面がお疲れ様へ進めるように)
  expect(valueOf(afterDone).status).toBe("done");
});

test("途中から参加した人はリーダーにならない", async () => {
  // Arrange
  const { store, id } = await setUp();
  await store.join(id, { userId: HELPER_A, displayName: "A" }, NOW);
  await store.arrive(id, HELPER_A, NOW);
  await store.start(id, HELPER_A, NOW);

  // Act
  const joined = valueOf(await store.join(id, { userId: HELPER_B, displayName: "B" }, NOW));
  const arrived = valueOf(await store.arrive(id, HELPER_B, NOW));

  // Assert
  expect(joined.leaderUserId).toBe(HELPER_A);
  expect(arrived.leaderUserId).toBe(HELPER_A);
});

test(`定員(${MAX_HELPERS} 人)を超えて参加できず、満員の依頼は一覧から消える`, async () => {
  // Arrange
  const { store, id } = await setUp();
  for (let i = 0; i < MAX_HELPERS; i += 1) {
    await store.join(id, { userId: userIdOf(i + 10), displayName: `若者${i}` }, NOW);
  }

  // Act
  const overflow = await store.join(id, { userId: HELPER_A, displayName: "A" }, NOW);

  // Assert
  expect(overflow).toMatchObject({ ok: false, status: 409 });
  expect(await store.listOpen()).toEqual([]);
});

test("同じ人が 2 回参加しても 1 人として数え、自分の依頼には参加できない", async () => {
  // Arrange
  const { store, id } = await setUp();

  // Act
  await store.join(id, { userId: HELPER_A, displayName: "A" }, NOW);
  const again = valueOf(await store.join(id, { userId: HELPER_A, displayName: "A" }, NOW));
  const self = await store.join(id, { userId: ELDER_ID, displayName: "本人" }, NOW);

  // Assert
  expect(again.helpers).toHaveLength(1);
  expect(self).toMatchObject({ ok: false, status: 400 });
});

test("全員が参加をやめると募集中に戻る(開始前なのでリーダーはまだいない)", async () => {
  // Arrange
  const { store, id } = await setUp();
  await store.join(id, { userId: HELPER_A, displayName: "A" }, NOW);
  await store.join(id, { userId: HELPER_B, displayName: "B" }, NOW);

  // Act
  const afterLeaderLeft = valueOf(await store.leave(id, HELPER_A));
  const afterAllLeft = valueOf(await store.leave(id, HELPER_B));

  // Assert
  expect(afterLeaderLeft.helpers.map((h) => h.userId)).toEqual([HELPER_B]);
  expect(afterLeaderLeft.status).toBe("accepted");
  expect(afterLeaderLeft.leaderUserId).toBeNull();
  expect(afterAllLeft.status).toBe("waiting");
});

test("雪かきが始まったあとでも途中から参加でき、状態は雪かき中のまま", async () => {
  // Arrange
  const { store, id } = await setUp();
  await store.join(id, { userId: HELPER_A, displayName: "A" }, NOW);
  await store.arrive(id, HELPER_A, NOW);
  await store.start(id, HELPER_A, NOW);

  // Act
  const joined = valueOf(await store.join(id, { userId: HELPER_B, displayName: "B" }, NOW));
  const open = await store.listOpen();

  // Assert
  expect(joined.status).toBe("working");
  expect(joined.helpers.map((h) => h.userId)).toEqual([HELPER_A, HELPER_B]);
  expect(open.map((r) => r.id)).toContain(id);
});

test("雪かきが始まったら、参加の取り消しはできない", async () => {
  // Arrange
  const { store, id } = await setUp();
  await store.join(id, { userId: HELPER_A, displayName: "A" }, NOW);
  await store.arrive(id, HELPER_A, NOW);
  await store.start(id, HELPER_A, NOW);

  // Act & Assert
  expect(await store.leave(id, HELPER_A)).toMatchObject({ status: 409 });
});

test("始まる前は終了できず、参加していない人も終了できない", async () => {
  // Arrange
  const { store, id } = await setUp();
  await store.join(id, { userId: HELPER_A, displayName: "A" }, NOW);

  // Act & Assert
  expect(await store.finish(id, { userId: HELPER_A, areaM2: 10 }, 0.3, NOW)).toMatchObject({ status: 409 });
  expect(await store.finish(id, { userId: HELPER_B, areaM2: 10 }, 0.3, NOW)).toMatchObject({ status: 403 });
});

test("取り消せるのは依頼した本人だけ。取り消した依頼は一覧にも待機画面にも出ない", async () => {
  // Arrange
  const { store, id } = await setUp();

  // Act
  const byOther = await store.cancel(id, HELPER_A, NOW);
  const byOwner = await store.cancel(id, ELDER_ID, NOW);
  const twice = await store.cancel(id, ELDER_ID, NOW);

  // Assert
  expect(byOther).toMatchObject({ ok: false, status: 403 });
  expect(valueOf(byOwner).status).toBe("cancelled");
  expect(twice).toMatchObject({ ok: false, status: 409 });
  expect(await store.listOpen()).toEqual([]);
  expect(await store.findMine(ELDER_ID)).toBeNull();
});

test("いいねは依頼した本人が、終わった依頼に 1 回だけ送れる", async () => {
  // Arrange
  const { store, id } = await setUp();
  await store.join(id, { userId: HELPER_A, displayName: "A" }, NOW);
  const early = await store.thank(id, ELDER_ID, { [HELPER_A]: 5 }, NOW);
  await store.arrive(id, HELPER_A, NOW);
  await store.start(id, HELPER_A, NOW);
  await store.finish(id, { userId: HELPER_A, areaM2: 10 }, 0.3, minutesLater(10));

  // Act
  const byOther = await store.thank(id, HELPER_A, { [HELPER_A]: 5 }, NOW);
  const stranger = await store.thank(id, ELDER_ID, { [HELPER_B]: 5 }, NOW);
  const first = await store.thank(id, ELDER_ID, { [HELPER_A]: 4 }, NOW);
  const second = await store.thank(id, ELDER_ID, { [HELPER_A]: 5 }, NOW);

  // Assert
  expect(early).toMatchObject({ ok: false, status: 409 });
  expect(byOther).toMatchObject({ ok: false, status: 403 });
  expect(stranger).toMatchObject({ ok: false, status: 400 });
  expect(valueOf(first).ratings).toEqual({ [HELPER_A]: 4 });
  expect(second).toMatchObject({ ok: false, status: 409 });
  expect(await store.findMine(ELDER_ID)).toBeNull();
});

test("終わったがいいね前の依頼は、待機画面用(findMine)に残る", async () => {
  // Arrange
  const { store, id } = await setUp();
  await store.join(id, { userId: HELPER_A, displayName: "A" }, NOW);
  await store.arrive(id, HELPER_A, NOW);
  await store.start(id, HELPER_A, NOW);

  // Act
  await store.finish(id, { userId: HELPER_A, areaM2: 10 }, 0.3, NOW);

  // Assert
  expect((await store.findMine(ELDER_ID))?.status).toBe("done");
});

test("一覧向けの形では、名前・住所・正確な位置・ユーザー ID を見せない", async () => {
  // Arrange
  const store = createHelpRequestStore();
  const request = await store.create(
    {
      userId: ELDER_ID,
      amount: "lots",
      name: "雪野 花子",
      address: "北海道美唄市東1条南2丁目3-4",
      lat: 43.33456,
      lng: 141.85678,
    },
    NOW,
  );

  // Act
  const view = toPublicView(request);

  // Assert
  expect(view).toMatchObject({ area: "東", approxLat: 43.33, approxLng: 141.86 });
  expect(JSON.stringify(view)).not.toMatch(/雪野|2丁目|43\.33456|ddddd/);
});

test("住所から大まかな地区を取り出す。分からなければ「美唄市内」", () => {
  // Arrange & Act & Assert
  expect(roughArea("美唄市字光珠内123")).toBe("字光珠内");
  expect(roughArea(null)).toBe("美唄市内");
  expect(roughArea("北海道美唄市")).toBe("美唄市内");
});
