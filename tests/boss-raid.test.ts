import { describe, expect, test } from "vitest";
import {
  BOSS_HP_PER_HELPER,
  announcementFor,
  bossMaxHp,
  bossView,
  teamScoops,
} from "../public/liff/boss-raid.js";

describe("bossMaxHp(雪山ボスの体力)", () => {
  test("雪の多さ × 参加人数で決まる", () => {
    expect(bossMaxHp("normal", 2)).toBe(BOSS_HP_PER_HELPER.normal * 2);
    expect(bossMaxHp("lots", 3)).toBe(BOSS_HP_PER_HELPER.lots * 3);
  });

  test("人数が 0 でも 1 人ぶんの体力にする", () => {
    expect(bossMaxHp("little", 0)).toBe(BOSS_HP_PER_HELPER.little);
  });

  test("知らない雪の多さは「ふつう」として扱う", () => {
    expect(bossMaxHp("unknown", 1)).toBe(BOSS_HP_PER_HELPER.normal);
  });
});

describe("teamScoops(みんなのすくった回数)", () => {
  const helpers = [
    { userId: "me", scoops: 5 },
    { userId: "a", scoops: 10 },
    { userId: "b" },
  ];

  test("ほかの人はサーバーの回数、自分は端末の回数を使う", () => {
    expect(teamScoops(helpers, "me", 8)).toBe(18);
  });

  test("端末の回数がサーバーより少なければ、サーバーの回数を使う", () => {
    expect(teamScoops(helpers, "me", 2)).toBe(15);
  });

  test("参加者の一覧に自分がいなくても、自分の回数を足す", () => {
    expect(teamScoops([{ userId: "a", scoops: 3 }], "me", 4)).toBe(7);
  });
});

describe("bossView(ボスの残り体力)", () => {
  test("すくった回数だけ体力が減る", () => {
    expect(bossView(30, 120)).toEqual({ hp: 90, maxHp: 120, ratio: 0.75, isDefeated: false });
  });

  test("体力を超えてすくったら 0 で止まり、倒したことになる", () => {
    expect(bossView(200, 120)).toEqual({ hp: 0, maxHp: 120, ratio: 0, isDefeated: true });
  });
});

describe("announcementFor(実況のことば)", () => {
  const at = (mine: number, team: number, maxHp = 100) => ({ mine, team, maxHp });

  test("回数が増えていなければ、何も言わない", () => {
    expect(announcementFor(at(3, 3), at(3, 3))).toBeNull();
  });

  test("自分が 10 杯ごとに、杯数と重さを言う", () => {
    expect(announcementFor(at(9, 9), at(10, 10))).toEqual({ kind: "mine", text: "10杯!約35キロ!" });
  });

  test("節目でなければ何も言わない", () => {
    expect(announcementFor(at(10, 10), at(11, 11))).toBeNull();
  });

  test("みんなで 50 杯ごとに言う(自分の節目より優先)", () => {
    expect(announcementFor(at(19, 49, 1000), at(20, 50, 1000))).toEqual({ kind: "team", text: "みんなで50杯!" });
  });

  test("ボスの体力が 4 分の 1 減ったら知らせる", () => {
    expect(announcementFor(at(1, 24), at(2, 25))).toEqual({ kind: "boss", text: "ボスがひるんだ!" });
  });

  test("ボスの体力が半分になったら知らせる(みんなの節目より優先)", () => {
    expect(announcementFor(at(9, 49), at(10, 50))).toEqual({ kind: "boss", text: "ボスの体力、あと半分!" });
  });

  test("ボスの体力が残り 4 分の 1 になったら知らせる", () => {
    expect(announcementFor(at(1, 74), at(2, 75))).toEqual({ kind: "boss", text: "ボス、あと少し!" });
  });

  test("ボスを倒したら、いちばん優先して知らせる", () => {
    expect(announcementFor(at(9, 99), at(10, 100))).toEqual({
      kind: "defeat",
      text: "雪山ボスを倒した!みんなで100杯!",
    });
  });

  test("倒したあとは、ボスのことは言わない", () => {
    expect(announcementFor(at(10, 100), at(11, 150))).toEqual({ kind: "team", text: "みんなで150杯!" });
  });

  test("途中で人が増えて体力が上がり、割合が戻っても知らせない", () => {
    expect(announcementFor(at(1, 60, 100), at(1, 60, 200))).toBeNull();
  });
});
