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

function setUp() {
  const store = createHelpRequestStore();
  const request = store.create({ userId: ELDER_ID, amount: "normal" }, NOW);
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
  expect(parseFinishInput({ userId: HELPER_A, areaM2: 2001 })).toBeNull();
  expect(parseFinishInput({ userId: HELPER_A, areaM2: -1 })).toBeNull();
  expect(parseThanksInput({ userId: ELDER_ID, ratings: { [HELPER_A]: 6 } })).toBeNull();
  expect(parseThanksInput({ userId: ELDER_ID, ratings: {} })).toBeNull();
  expect(parseThanksInput({ userId: ELDER_ID, ratings: { [HELPER_A]: 3 } })).toEqual({
    userId: ELDER_ID,
    ratings: { [HELPER_A]: 3 },
  });
});

test("参加 → 到着 → 開始 → 終了 と状態が進み、もとの依頼は書き換わらない", () => {
  // Arrange
  const { store, id } = setUp();
  const before = store.findById(id);

  // Act
  const joined = valueOf(store.join(id, { userId: HELPER_A, displayName: "ゆきお" }, NOW));
  const arrived = valueOf(store.arrive(id, HELPER_A, minutesLater(5)));
  const started = valueOf(store.start(id, HELPER_A, minutesLater(6)));
  const finished = valueOf(store.finish(id, { userId: HELPER_A, areaM2: 20 }, 0.5, minutesLater(36)));

  // Assert
  expect(before?.status).toBe("waiting");
  expect(before?.helpers).toEqual([]);
  expect(joined.status).toBe("accepted");
  expect(arrived.helpers[0]?.arrivedAt).toBe(minutesLater(5).toISOString());
  expect(started).toMatchObject({ status: "working", startedAt: minutesLater(6).toISOString() });
  expect(finished.status).toBe("done");
  expect(finished.result).toEqual({
    minutes: 30,
    areaM2: 20,
    snowDepthM: 0.5,
    snowKg: 1000,
    calories: 173,
    workPoints: 30 * 100 + 1000 * 10,
    finishedBy: HELPER_A,
  });
});

test("最初に参加した人がリーダーで、リーダー以外は開始できない", () => {
  // Arrange
  const { store, id } = setUp();
  store.join(id, { userId: HELPER_A, displayName: "A" }, NOW);
  store.join(id, { userId: HELPER_B, displayName: "B" }, NOW);

  // Act
  const byOther = store.start(id, HELPER_B, NOW);
  const byLeader = store.start(id, HELPER_A, NOW);

  // Assert
  expect(byOther).toMatchObject({ ok: false, status: 403 });
  expect(byLeader.ok).toBe(true);
});

test(`定員(${MAX_HELPERS} 人)を超えて参加できず、満員の依頼は一覧から消える`, () => {
  // Arrange
  const { store, id } = setUp();
  Array.from({ length: MAX_HELPERS }, (_, i) =>
    store.join(id, { userId: userIdOf(i + 10), displayName: `若者${i}` }, NOW),
  );

  // Act
  const overflow = store.join(id, { userId: HELPER_A, displayName: "A" }, NOW);

  // Assert
  expect(overflow).toMatchObject({ ok: false, status: 409 });
  expect(store.listOpen()).toEqual([]);
});

test("同じ人が 2 回参加しても 1 人として数え、自分の依頼には参加できない", () => {
  // Arrange
  const { store, id } = setUp();

  // Act
  store.join(id, { userId: HELPER_A, displayName: "A" }, NOW);
  const again = valueOf(store.join(id, { userId: HELPER_A, displayName: "A" }, NOW));
  const self = store.join(id, { userId: ELDER_ID, displayName: "本人" }, NOW);

  // Assert
  expect(again.helpers).toHaveLength(1);
  expect(self).toMatchObject({ ok: false, status: 400 });
});

test("全員が参加をやめると募集中に戻り、リーダーがやめると次の人がリーダーになる", () => {
  // Arrange
  const { store, id } = setUp();
  store.join(id, { userId: HELPER_A, displayName: "A" }, NOW);
  store.join(id, { userId: HELPER_B, displayName: "B" }, NOW);

  // Act
  const afterLeaderLeft = valueOf(store.leave(id, HELPER_A));
  const afterAllLeft = valueOf(store.leave(id, HELPER_B));

  // Assert
  expect(afterLeaderLeft.helpers[0]?.userId).toBe(HELPER_B);
  expect(afterLeaderLeft.status).toBe("accepted");
  expect(afterAllLeft.status).toBe("waiting");
});

test("雪かきが始まったら参加も、参加の取り消しもできない", () => {
  // Arrange
  const { store, id } = setUp();
  store.join(id, { userId: HELPER_A, displayName: "A" }, NOW);
  store.start(id, HELPER_A, NOW);

  // Act & Assert
  expect(store.join(id, { userId: HELPER_B, displayName: "B" }, NOW)).toMatchObject({ status: 409 });
  expect(store.leave(id, HELPER_A)).toMatchObject({ status: 409 });
});

test("始まる前は終了できず、参加していない人も終了できない", () => {
  // Arrange
  const { store, id } = setUp();
  store.join(id, { userId: HELPER_A, displayName: "A" }, NOW);

  // Act & Assert
  expect(store.finish(id, { userId: HELPER_A, areaM2: 10 }, 0.3, NOW)).toMatchObject({ status: 409 });
  expect(store.finish(id, { userId: HELPER_B, areaM2: 10 }, 0.3, NOW)).toMatchObject({ status: 403 });
});

test("取り消せるのは依頼した本人だけ。取り消した依頼は一覧にも待機画面にも出ない", () => {
  // Arrange
  const { store, id } = setUp();

  // Act
  const byOther = store.cancel(id, HELPER_A, NOW);
  const byOwner = store.cancel(id, ELDER_ID, NOW);
  const twice = store.cancel(id, ELDER_ID, NOW);

  // Assert
  expect(byOther).toMatchObject({ ok: false, status: 403 });
  expect(valueOf(byOwner).status).toBe("cancelled");
  expect(twice).toMatchObject({ ok: false, status: 409 });
  expect(store.listOpen()).toEqual([]);
  expect(store.findMine(ELDER_ID)).toBeNull();
});

test("いいねは依頼した本人が、終わった依頼に 1 回だけ送れる", () => {
  // Arrange
  const { store, id } = setUp();
  store.join(id, { userId: HELPER_A, displayName: "A" }, NOW);
  const early = store.thank(id, ELDER_ID, { [HELPER_A]: 5 }, NOW);
  store.start(id, HELPER_A, NOW);
  store.finish(id, { userId: HELPER_A, areaM2: 10 }, 0.3, minutesLater(10));

  // Act
  const byOther = store.thank(id, HELPER_A, { [HELPER_A]: 5 }, NOW);
  const stranger = store.thank(id, ELDER_ID, { [HELPER_B]: 5 }, NOW);
  const first = store.thank(id, ELDER_ID, { [HELPER_A]: 4 }, NOW);
  const second = store.thank(id, ELDER_ID, { [HELPER_A]: 5 }, NOW);

  // Assert
  expect(early).toMatchObject({ ok: false, status: 409 });
  expect(byOther).toMatchObject({ ok: false, status: 403 });
  expect(stranger).toMatchObject({ ok: false, status: 400 });
  expect(valueOf(first).ratings).toEqual({ [HELPER_A]: 4 });
  expect(second).toMatchObject({ ok: false, status: 409 });
  expect(store.findMine(ELDER_ID)).toBeNull();
});

test("終わったがいいね前の依頼は、待機画面用(findMine)に残る", () => {
  // Arrange
  const { store, id } = setUp();
  store.join(id, { userId: HELPER_A, displayName: "A" }, NOW);
  store.start(id, HELPER_A, NOW);

  // Act
  store.finish(id, { userId: HELPER_A, areaM2: 10 }, 0.3, NOW);

  // Assert
  expect(store.findMine(ELDER_ID)?.status).toBe("done");
});

test("一覧向けの形では、名前・住所・正確な位置・ユーザー ID を見せない", () => {
  // Arrange
  const store = createHelpRequestStore();
  const request = store.create(
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
