/**
 * 外から届いた入力(リクエストの中身)を確かめる。おかしければ null を返す。
 * ここを通った値だけを、ストア(依頼を覚えておく場所)に渡す。
 */
import { isValidUserId } from "../identity/store.js";
import { MAX_AREA_M2, MAX_CALORIES, MAX_SCOOPS, MAX_STARS, MIN_STARS } from "./model.js";
import type { HelpRequestExtras, HelpRequestInput, Ratings, SnowAmount } from "./model.js";

const SNOW_AMOUNTS: readonly SnowAmount[] = ["little", "normal", "lots"];
const MAX_NAME_LENGTH = 40;
const MAX_ADDRESS_LENGTH = 100;
const MAX_DEPTH_LENGTH = 20;
const MAX_TOOLS_LENGTH = 100;
const MAX_DISPLAY_NAME_LENGTH = 40;
const ID_PATTERN = /^[0-9a-f-]{36}$/;

/** 「値がない」と「値がおかしい」を分けるための印。 */
const INVALID = Symbol("invalid");

type Body = Record<string, unknown>;
const asBody = (raw: unknown): Body =>
  typeof raw === "object" && raw !== null ? (raw as Body) : {};

const isSnowAmount = (value: unknown): value is SnowAmount =>
  typeof value === "string" && (SNOW_AMOUNTS as readonly string[]).includes(value);

/** 依頼 ID(UUID)の形かどうか。 */
export const isValidRequestId = (value: unknown): value is string =>
  typeof value === "string" && ID_PATTERN.test(value);

/** 任意の文字の項目。空や省略なら undefined、長すぎ・文字でなければ INVALID。 */
function optionalText(value: unknown, maxLength: number): string | undefined | typeof INVALID {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") return INVALID;
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  return trimmed.length <= maxLength ? trimmed : INVALID;
}

function optionalNumber(value: unknown, min: number, max: number): number | undefined | typeof INVALID {
  if (value === undefined || value === null) return undefined;
  const isInRange = typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
  return isInRange ? value : INVALID;
}

/** 名前・住所・位置などの任意の項目を確かめる。緯度と経度はそろっていないとだめ。 */
function parseExtras(body: Body): HelpRequestExtras | null {
  const values = {
    name: optionalText(body.name, MAX_NAME_LENGTH),
    address: optionalText(body.address, MAX_ADDRESS_LENGTH),
    lat: optionalNumber(body.lat, -90, 90),
    lng: optionalNumber(body.lng, -180, 180),
    depth: optionalText(body.depth, MAX_DEPTH_LENGTH),
    tools: optionalText(body.tools, MAX_TOOLS_LENGTH),
  };
  const entries = Object.entries(values);
  if (entries.some(([, v]) => v === INVALID)) return null;
  if ((values.lat === undefined) !== (values.lng === undefined)) return null;
  // 値があるものだけ残す(省略された項目は入れない)
  return Object.fromEntries(entries.filter(([, v]) => v !== undefined)) as HelpRequestExtras;
}

/** 依頼の入力を確かめる。雪の量は省略すると「ふつう」。 */
export function parseHelpRequestInput(raw: unknown): HelpRequestInput | null {
  const body = asBody(raw);
  if (!isValidUserId(body.userId)) return null;
  const amount = body.amount ?? "normal";
  if (!isSnowAmount(amount)) return null;
  const extras = parseExtras(body);
  if (!extras) return null;
  return { ...extras, userId: body.userId, amount };
}

/** { userId } だけの入力(取り消し・到着・開始など)。 */
export function parseUserIdInput(raw: unknown): string | null {
  const userId = asBody(raw).userId;
  return isValidUserId(userId) ? userId : null;
}

export type JoinInput = { readonly userId: string; readonly displayName: string };

/** 参加の入力。表示名は必須(LINE の名前か「ゲスト〇〇」)。 */
export function parseJoinInput(raw: unknown): JoinInput | null {
  const body = asBody(raw);
  if (!isValidUserId(body.userId)) return null;
  const displayName = optionalText(body.displayName, MAX_DISPLAY_NAME_LENGTH);
  if (displayName === undefined || displayName === INVALID) return null;
  return { userId: body.userId, displayName };
}

export type FinishInput = { readonly userId: string; readonly areaM2: number };

/** 終了の入力。面積は 0〜上限(㎡)。 */
export function parseFinishInput(raw: unknown): FinishInput | null {
  const body = asBody(raw);
  if (!isValidUserId(body.userId)) return null;
  const areaM2 = optionalNumber(body.areaM2, 0, MAX_AREA_M2);
  if (areaM2 === undefined || areaM2 === INVALID) return null;
  return { userId: body.userId, areaM2 };
}

export type ScoopsInput = { readonly userId: string; readonly count: number; readonly calories?: number };

/** 0〜max の整数か。 */
const isIntegerUpTo = (value: unknown, max: number): value is number =>
  Number.isInteger(value) && (value as number) >= 0 && (value as number) <= max;

/** スコップ計の回数の入力。回数は 0〜上限の整数。アプリからは、測った消費カロリー(0〜上限の整数)も一緒に来る。 */
export function parseScoopsInput(raw: unknown): ScoopsInput | null {
  const body = asBody(raw);
  if (!isValidUserId(body.userId) || !isIntegerUpTo(body.count, MAX_SCOOPS)) return null;
  if (body.calories === undefined) return { userId: body.userId, count: body.count };
  return isIntegerUpTo(body.calories, MAX_CALORIES) ? { userId: body.userId, count: body.count, calories: body.calories } : null;
}

/**
 * 現在地として受け付ける範囲(日本のまわり)。これより外は入力ミスとみなす。
 * 誤差は 0〜10km まで(それより大きい位置は役に立たない)。
 */
const JAPAN_LAT = { min: 20, max: 46 } as const;
const JAPAN_LNG = { min: 122, max: 154 } as const;
const MAX_ACCURACY_M = 10_000;

export type LocationInput = {
  readonly userId: string;
  readonly lat: number;
  readonly lng: number;
  readonly accuracy: number | null;
};

/** 現在地の入力。緯度経度は日本のまわりだけ、誤差(accuracy)は省略できる。 */
export function parseLocationInput(raw: unknown): LocationInput | null {
  const body = asBody(raw);
  if (!isValidUserId(body.userId)) return null;
  const lat = optionalNumber(body.lat, JAPAN_LAT.min, JAPAN_LAT.max);
  const lng = optionalNumber(body.lng, JAPAN_LNG.min, JAPAN_LNG.max);
  const accuracy = optionalNumber(body.accuracy, 0, MAX_ACCURACY_M);
  if (lat === undefined || lat === INVALID || lng === undefined || lng === INVALID) return null;
  if (accuracy === INVALID) return null;
  return { userId: body.userId, lat, lng, accuracy: accuracy ?? null };
}

export type ThanksInput ={ readonly userId: string; readonly ratings: Ratings };

const isStars = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= MIN_STARS && (value as number) <= MAX_STARS;

/** いいねの入力。ratings は { 若者のユーザー ID: 1〜5 } で、1 人以上。 */
export function parseThanksInput(raw: unknown): ThanksInput | null {
  const body = asBody(raw);
  if (!isValidUserId(body.userId)) return null;
  const ratings = body.ratings;
  if (typeof ratings !== "object" || ratings === null || Array.isArray(ratings)) return null;
  const entries = Object.entries(ratings);
  const isValid =
    entries.length > 0 && entries.every(([id, stars]) => isValidUserId(id) && isStars(stars));
  return isValid ? { userId: body.userId, ratings: Object.fromEntries(entries) } : null;
}
