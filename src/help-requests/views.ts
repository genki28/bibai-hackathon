/**
 * 依頼を「だれに見せるか」で形を変える。
 * - 参加していない若者(一覧など): 名前・住所・正確な位置・ユーザー ID は見せない。位置はおおまか(約 1km)だけ
 * - 依頼した本人と参加した若者: すべて見せる
 */
import { findHelper, leaderOf, MAX_HELPERS } from "./model.js";
import type { HelpRequest, HelpRequestStatus, SnowAmount } from "./model.js";

/** 位置がない依頼に使う、美唄市の中心あたり。 */
export const BIBAI_CENTER = { lat: 43.33, lng: 141.853 } as const;
/** おおまかな位置にするときの小数の桁数(2 桁 ≒ 1km)。 */
const ROUGH_DIGITS = 2;
const MAX_AREA_LABEL_LENGTH = 8;
const DEFAULT_AREA = "美唄市内";

export type Viewer = "elder" | "helper" | "guest";

export type PublicHelpRequest = {
  readonly id: string;
  readonly status: HelpRequestStatus;
  readonly amount: SnowAmount;
  readonly area: string;
  readonly approxLat: number;
  readonly approxLng: number;
  readonly depth: string | null;
  readonly tools: string | null;
  readonly createdAt: string;
  readonly helperCount: number;
  readonly capacity: number;
  readonly viewer: "guest";
};

export type MemberHelpRequest = HelpRequest & {
  readonly area: string;
  readonly capacity: number;
  readonly leaderUserId: string | null;
  readonly viewer: "elder" | "helper";
};

const roundTo = (value: number, digits: number): number => {
  const base = 10 ** digits;
  return Math.round(value * base) / base;
};

/**
 * 住所から「地区」くらいの大まかな場所を取り出す(例: 「北海道美唄市東1条南2丁目」→「東」)。
 * 番地より前の部分だけを使う。分からなければ「美唄市内」。
 */
export function roughArea(address: string | null): string {
  if (!address) return DEFAULT_AREA;
  const rest = address.replace(/^北海道/, "").replace(/^美唄市/, "").trim();
  const head = rest.split(/[0-9０-９一二三四五六七八九十丁番-]/)[0]?.trim() ?? "";
  return head === "" ? DEFAULT_AREA : head.slice(0, MAX_AREA_LABEL_LENGTH);
}

export function viewerOf(r: HelpRequest, userId: string | null): Viewer {
  if (!userId) return "guest";
  if (r.userId === userId) return "elder";
  return findHelper(r, userId) ? "helper" : "guest";
}

export function toPublicView(r: HelpRequest): PublicHelpRequest {
  return {
    id: r.id,
    status: r.status,
    amount: r.amount,
    area: roughArea(r.address),
    approxLat: roundTo(r.lat ?? BIBAI_CENTER.lat, ROUGH_DIGITS),
    approxLng: roundTo(r.lng ?? BIBAI_CENTER.lng, ROUGH_DIGITS),
    depth: r.depth,
    tools: r.tools,
    createdAt: r.createdAt,
    helperCount: r.helpers.length,
    capacity: MAX_HELPERS,
    viewer: "guest",
  };
}

export function toMemberView(r: HelpRequest, viewer: "elder" | "helper"): MemberHelpRequest {
  return {
    ...r,
    area: roughArea(r.address),
    capacity: MAX_HELPERS,
    leaderUserId: leaderOf(r)?.userId ?? null,
    viewer,
  };
}

/** 見る人に合わせた形にする。 */
export function toViewFor(
  r: HelpRequest,
  userId: string | null,
): PublicHelpRequest | MemberHelpRequest {
  const viewer = viewerOf(r, userId);
  return viewer === "guest" ? toPublicView(r) : toMemberView(r, viewer);
}
