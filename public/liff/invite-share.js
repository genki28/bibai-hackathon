// 「友だちを誘う」ボタンの中身(ランキングの画面で使う)。
// 自分の招待コードをサーバーからもらい、招待リンク(https://liff.line.me/{LIFF ID}/index.html?invite=コード)を作る。
// LINE の中なら liff.shareTargetPicker で友だちに招待メッセージを送る。使えなければリンクをコピーする。

import { callApi, fetchAppConfig, resolveOwnProfile } from "./common.js";

/** 招待リンク。LIFF ID がなければ(手元の PC で試すとき)、このサーバーの index.html を使う。 */
export function buildInviteUrl(liffId, code) {
  const query = `?invite=${encodeURIComponent(code)}`;
  return liffId
    ? `https://liff.line.me/${liffId}/index.html${query}`
    : `${location.origin}/liff/index.html${query}`;
}

const inviteMessage = (url) =>
  `美唄でいっしょに雪かきしよう!⛄\nお年寄りの家の雪かきを手伝って、ランキングを競うアプリです。\nこのリンクから始めてね👇\n${url}`;

/** shareTargetPicker が使えるか(LIFF の準備ができていないなどで調べられなければ false)。 */
async function canSharePicker() {
  const liff = window.liff;
  if (!liff?.isApiAvailable) return false;
  try {
    await resolveOwnProfile(); // liff.init が済むのを待つ
    return liff.isApiAvailable("shareTargetPicker");
  } catch (error) {
    console.error(error);
    return false;
  }
}

/**
 * 友だちを誘う。結果を画面に出す文を返す。
 * @param {string} userId
 * @returns {Promise<string>}
 */
export async function inviteFriends(userId) {
  const [{ liffId }, { code }] = await Promise.all([
    fetchAppConfig(),
    callApi(`/api/invites/mine?userId=${encodeURIComponent(userId)}`),
  ]);
  const url = buildInviteUrl(liffId, code);
  if (await canSharePicker()) {
    const sent = await window.liff.shareTargetPicker([{ type: "text", text: inviteMessage(url) }]);
    return sent ? "招待を送りました!友だちが初めて雪かきを終えると +500 pt" : "送るのをやめました。";
  }
  const manual = `このリンクを友だちに送ってください: ${url}`;
  if (!navigator.clipboard?.writeText) return manual;
  try {
    await navigator.clipboard.writeText(url);
    return "招待リンクをコピーしました!友だちに送ってね(初めて雪かきを終えると +500 pt)";
  } catch (error) {
    // 端末によっては、待ち時間のあとのコピーが許されない
    console.error("リンクをコピーできませんでした", error);
    return manual;
  }
}
