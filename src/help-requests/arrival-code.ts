/**
 * 音の合言葉(スマホを近づけて到着)の合言葉。
 * - 若者のスマホが、自分の 4 桁を高い音で鳴らす。お年寄りのスマホが聞き取ってサーバーに送り、合った若者を到着にする
 *   (若者は何人も来るので、鳴らすのは若者・聞くのはお年寄りの 1 台にしている)
 * - 合言葉は「依頼 ID + 若者の ID」と「サーバーだけが知っている秘密」から作る(HMAC)。表に保存しないので、表の変更はいらない
 * - 若者は自分の合言葉を知っているが、到着にできるのは「お年寄りのスマホが、その場で音を聞いたとき」だけ
 * - 音で聞き分けやすいように、となり合う数字は同じにしない(「1123」は作らない)
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const ARRIVAL_CODE_LENGTH = 4;
/** 秘密が設定されていない(手元で .env が空の)ときに使う値。本番では LINE のチャネルシークレットを使う。 */
const FALLBACK_SECRET = "bibai-local-arrival-code";
const DIGITS = 10;

/** その依頼でのその若者の合言葉(4 桁の数字の文字)。 */
export function arrivalCodeFor(requestId: string, helperUserId: string, secret: string): string {
  const bytes = createHmac("sha256", secret || FALLBACK_SECRET).update(`${requestId}:${helperUserId}`).digest();
  const digits: number[] = [];
  for (let i = 0; digits.length < ARRIVAL_CODE_LENGTH; i += 1) {
    const digit = (bytes[i] ?? i) % DIGITS;
    const previous = digits[digits.length - 1];
    digits.push(digit === previous ? (digit + 1) % DIGITS : digit);
  }
  return digits.join("");
}

/** 合言葉の形(4 桁の数字の文字)か。 */
export function isArrivalCodeInput(value: unknown): value is string {
  return typeof value === "string" && new RegExp(`^\\d{${ARRIVAL_CODE_LENGTH}}$`).test(value);
}

/** 2 つの合言葉が同じか(比べる時間で中身を推測されないように、timingSafeEqual で比べる)。 */
function isSameCode(expected: string, actual: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** 聞き取った合言葉が、どの若者のものか。まだ着いていない若者から探す。見つからなければ null。 */
export function helperForCode(
  requestId: string,
  helpers: ReadonlyArray<{ readonly userId: string; readonly arrivedAt: string | null }>,
  secret: string,
  code: string,
): string | null {
  const helper = helpers.find((h) => !h.arrivedAt && isSameCode(arrivalCodeFor(requestId, h.userId, secret), code));
  return helper?.userId ?? null;
}
