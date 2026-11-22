/**
 * 依頼の状態を進める処理(純粋関数)。もとの依頼は書き換えず、新しい依頼を作って返す。
 * できないとき(権限がない・状態が合わない)は、理由つきの失敗を返す。
 */
import { fail, findHelper, isJoinable, isOpen, leaderOf, MAX_HELPERS, succeed } from "./model.js";
import type { Helper, HelpRequest, Ratings, Result } from "./model.js";
import type { FinishInput, JoinInput } from "./inputs.js";
import { canFinish, canStart, pickLeader } from "./leader.js";
import type { RandomSource } from "./leader.js";
import {
  calculateCalories,
  calculateSnowKg,
  calculateWorkPoints,
  elapsedMinutes,
} from "./score.js";

const NOT_HELPER = fail(403, "この依頼に参加していません。");
const NOT_OWNER = fail(403, "依頼した本人だけができます。");

/** 若者が参加する。すでに参加していれば、そのまま返す。雪かき中なら途中から加わる(状態は雪かき中のまま)。 */
export function join(r: HelpRequest, input: JoinInput, now: Date): Result<HelpRequest> {
  if (findHelper(r, input.userId)) return succeed(r);
  if (r.userId === input.userId) return fail(400, "自分の依頼には参加できません。");
  if (!isJoinable(r)) return fail(409, "この依頼は、いまは参加を受け付けていません。");
  if (r.helpers.length >= MAX_HELPERS) return fail(409, `定員(${MAX_HELPERS} 人)に達しています。`);
  const helper: Helper = { ...input, joinedAt: now.toISOString(), arrivedAt: null };
  const status = r.status === "working" ? "working" : "accepted";
  return succeed({ ...r, status, helpers: [...r.helpers, helper] });
}

/** 参加をやめる(雪かきが始まる前だけ)。だれもいなくなったら募集中に戻る。 */
export function leave(r: HelpRequest, userId: string): Result<HelpRequest> {
  if (!findHelper(r, userId)) return NOT_HELPER;
  if (!isOpen(r)) return fail(409, "雪かきが始まっているので、取り消せません。");
  const helpers = r.helpers.filter((h) => h.userId !== userId);
  return succeed({ ...r, helpers, status: helpers.length === 0 ? "waiting" : "accepted" });
}

/** 到着した。すでに到着していればそのまま。 */
export function arrive(r: HelpRequest, userId: string, now: Date): Result<HelpRequest> {
  const helper = findHelper(r, userId);
  if (!helper) return NOT_HELPER;
  if (r.status !== "accepted" && r.status !== "working") {
    return fail(409, "この依頼は、いまは到着を受け付けていません。");
  }
  if (helper.arrivedAt) return succeed(r);
  const helpers = r.helpers.map((h) =>
    h.userId === userId ? { ...h, arrivedAt: now.toISOString() } : h,
  );
  return succeed({ ...r, helpers });
}

/**
 * 雪かきを始める(到着した参加者ならだれでも)。開始時刻を残し、
 * その時点の参加者からランダムにリーダーを 1 人決めて残す(到着済みの人を優先)。
 */
export function start(
  r: HelpRequest,
  userId: string,
  now: Date,
  random: RandomSource,
): Result<HelpRequest> {
  if (!findHelper(r, userId)) return NOT_HELPER;
  if (r.status === "working") return succeed(r);
  if (r.status !== "accepted") return fail(409, "この依頼は、いまは開始できません。");
  if (!canStart(r, userId)) return fail(403, "到着してから開始してください。");
  const leader = pickLeader(r.helpers, random);
  return succeed({
    ...r,
    status: "working",
    startedAt: now.toISOString(),
    leaderUserId: leader?.userId ?? null,
  });
}

/**
 * 雪かきを終える(範囲に丸を付けたリーダーだけ)。作業時間・雪の重さ・カロリー・ポイントを計算して残す。
 * もう終わっていたら、その結果をそのまま返す。
 */
export function finish(
  r: HelpRequest,
  input: FinishInput,
  snowDepthM: number,
  now: Date,
): Result<HelpRequest> {
  if (!findHelper(r, input.userId)) return NOT_HELPER;
  if (r.status === "done") return succeed(r);
  if (r.status !== "working" || !r.startedAt) return fail(409, "雪かきが始まっていません。");
  if (!canFinish(r, input.userId)) {
    const leaderName = leaderOf(r)?.displayName ?? "リーダー";
    return fail(403, `範囲に丸を付けて終われるのはリーダー(${leaderName}さん)だけです。`);
  }
  const minutes = elapsedMinutes(r.startedAt, now);
  const snowKg = calculateSnowKg(input.areaM2, snowDepthM);
  const result = {
    minutes,
    areaM2: Math.round(input.areaM2),
    snowDepthM,
    snowKg,
    calories: calculateCalories(minutes),
    workPoints: calculateWorkPoints(minutes, snowKg),
    finishedBy: input.userId,
  };
  return succeed({ ...r, status: "done", finishedAt: now.toISOString(), result });
}

/** お年寄りが依頼を取り消す(本人だけ)。終わった依頼は取り消せない。 */
export function cancel(r: HelpRequest, userId: string, now: Date): Result<HelpRequest> {
  if (r.userId !== userId) return NOT_OWNER;
  if (r.status === "done" || r.status === "cancelled") {
    return fail(409, "この依頼は、もう取り消せません。");
  }
  return succeed({ ...r, status: "cancelled", cancelledAt: now.toISOString() });
}

/** お年寄りが若者に星を付ける(本人だけ・終わった依頼に 1 回だけ)。 */
export function thank(
  r: HelpRequest,
  userId: string,
  ratings: Ratings,
  now: Date,
): Result<HelpRequest> {
  if (r.userId !== userId) return NOT_OWNER;
  if (r.status !== "done") return fail(409, "雪かきが終わってから送ってください。");
  if (r.thankedAt) return fail(409, "いいねは 1 回だけ送れます。");
  const isAllHelpers = Object.keys(ratings).every((id) => findHelper(r, id));
  if (!isAllHelpers) return fail(400, "参加していない人が含まれています。");
  return succeed({ ...r, ratings, thankedAt: now.toISOString() });
}
