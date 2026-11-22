/**
 * LIFF の ID トークン(= LINE が発行する「この人はたしかに本人です」という証明)を確かめる。
 * 画面から送られてきたユーザー ID をそのまま信じると、他の人になりすませてしまうため。
 * https://developers.line.biz/ja/reference/line-login/#verify-id-token
 */

const VERIFY_URL = "https://api.line.me/oauth2/v2.1/verify";
const CHANNEL_ID_PATTERN = /^(\d+)-/;

export class InvalidIdTokenError extends Error {
  constructor() {
    super("ID トークンを確認できませんでした。");
    this.name = "InvalidIdTokenError";
  }
}

/** ID トークンを確かめて、本人のユーザー ID を返す。正しくなければ InvalidIdTokenError。 */
export type VerifyIdToken = (idToken: string, channelId: string) => Promise<string>;

/** LIFF ID は「LINE ログインのチャネル ID」+「-」+「英数字」の形なので、前半を取り出す。 */
export function channelIdFromLiffId(liffId: string): string | null {
  return CHANNEL_ID_PATTERN.exec(liffId)?.[1] ?? null;
}

export const verifyIdTokenWithLine: VerifyIdToken = async (idToken, channelId) => {
  const response = await fetch(VERIFY_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ id_token: idToken, client_id: channelId }),
  });
  if (response.status === 400) throw new InvalidIdTokenError();
  if (!response.ok) throw new Error(`LINE の確認 API が ${response.status} を返しました。`);
  const body = (await response.json()) as { sub?: unknown };
  if (typeof body.sub !== "string") throw new InvalidIdTokenError();
  return body.sub;
};
