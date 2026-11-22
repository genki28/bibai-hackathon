/**
 * 雪かきの依頼の「形」(型)と、決まった値(定数)。
 * 依頼の状態は waiting(募集中)→ accepted(だれか参加)→ working(雪かき中)→ done(終了)。
 * どこからでも cancelled(お年寄りが取り消し)になる。
 */

/** 雪の量。little = すこし、normal = ふつう(未選択)、lots = たくさん。 */
export type SnowAmount = "little" | "normal" | "lots";
export type HelpRequestStatus = "waiting" | "accepted" | "working" | "done" | "cancelled";

/** 1 つの依頼に参加できる人数(仮)。 */
export const MAX_HELPERS = 5;
/** 雪かきした範囲の面積の上限(㎡)。これより大きいのは入力ミスとみなす。 */
export const MAX_AREA_M2 = 2000;
/** 評価の星の数の範囲。 */
export const MIN_STARS = 1;
export const MAX_STARS = 5;

/** フォームから任意で届く項目(なければ省略)。 */
export type HelpRequestExtras = {
  readonly name?: string; // お年寄りの名前
  readonly address?: string; // 住所(文字)
  readonly lat?: number; // 緯度
  readonly lng?: number; // 経度
  readonly depth?: string; // 雪の深さ(フォームの選択値)
  readonly tools?: string; // 道具
};

export type HelpRequestInput = HelpRequestExtras & {
  readonly userId: string;
  readonly amount: SnowAmount;
};

/** 参加した若者。最初に参加した人(helpers の先頭)がリーダー。 */
export type Helper = {
  readonly userId: string;
  readonly displayName: string;
  readonly joinedAt: string;
  readonly arrivedAt: string | null;
};

/** 雪かきの結果。参加した全員に workPoints が入る。 */
export type WorkResult = {
  readonly minutes: number;
  readonly areaM2: number;
  readonly snowDepthM: number;
  readonly snowKg: number;
  readonly calories: number;
  readonly workPoints: number;
  readonly finishedBy: string;
};

/** 若者ごとの星の数({ 若者のユーザー ID: 1〜5 })。 */
export type Ratings = Readonly<Record<string, number>>;

export type HelpRequest = {
  readonly id: string;
  readonly userId: string;
  readonly amount: SnowAmount;
  readonly name: string | null;
  readonly address: string | null;
  readonly lat: number | null;
  readonly lng: number | null;
  readonly depth: string | null;
  readonly tools: string | null;
  readonly status: HelpRequestStatus;
  readonly createdAt: string;
  readonly helpers: readonly Helper[];
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
  readonly cancelledAt: string | null;
  readonly result: WorkResult | null;
  readonly ratings: Ratings | null;
  readonly thankedAt: string | null;
};

/** 処理の結果。失敗したときは HTTP のステータスと日本語のメッセージを持つ。 */
export type Failure = {
  readonly ok: false;
  readonly status: 400 | 403 | 404 | 409;
  readonly error: string;
};
export type Result<T> = { readonly ok: true; readonly value: T } | Failure;

export const succeed = <T>(value: T): Result<T> => ({ ok: true, value });
export const fail = (status: Failure["status"], error: string): Failure => ({
  ok: false,
  status,
  error,
});

/** 若者が参加・取り消しなどをまだできる(雪かきが始まっていない)状態か。 */
export const isOpen = (r: HelpRequest): boolean =>
  r.status === "waiting" || r.status === "accepted";

/** お年寄りから見て「まだ続いている」依頼か(取り消し・いいね済みは終わり)。 */
export const isOngoingForElder = (r: HelpRequest): boolean =>
  r.status !== "cancelled" && r.thankedAt === null;

export const leaderOf = (r: HelpRequest): Helper | null => r.helpers[0] ?? null;

export const findHelper = (r: HelpRequest, userId: string): Helper | null =>
  r.helpers.find((h) => h.userId === userId) ?? null;
