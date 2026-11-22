// 招待リンク(index.html?invite=コード)で開かれたとき、「だれに誘われたか」をサーバーに記録する。
// どの画面でも読み込む(template.js と main.js から import)。記録は 1 人 1 回だけで、
// 自分自身のコード・すでに記録済み・持ち主のいないコードはサーバーが無視する(エラーにはしない)。
// 招待リンクには LINE のユーザー ID ではなく、ランダムな招待コードが入っている。

import { isPreviewMode, postJson, resolveUserId } from "./common.js";

const INVITE_PARAM = "invite";
const CODE_PATTERN = /^[a-z0-9]{10}$/;

/**
 * URL から招待コードを読む。LINE で開いたときは、liff.init が済むまで
 * ?liff.state=%2Findex.html%3Finvite%3D〇〇 の中に入っていることがあるので、そちらも見る。
 */
function inviteCodeFromUrl() {
  const params = new URLSearchParams(location.search);
  const direct = params.get(INVITE_PARAM);
  if (direct) return direct;
  const state = params.get("liff.state") ?? "";
  const query = state.includes("?") ? state.slice(state.indexOf("?") + 1) : "";
  return new URLSearchParams(query).get(INVITE_PARAM);
}

/** 記録できたら、URL から ?invite= を消す(読み直しても送り直さないように)。 */
function removeInviteFromUrl() {
  const url = new URL(location.href);
  if (!url.searchParams.has(INVITE_PARAM)) return;
  url.searchParams.delete(INVITE_PARAM);
  history.replaceState(history.state, "", url);
}

async function acceptInviteFromUrl() {
  if (isPreviewMode()) return;
  const code = inviteCodeFromUrl();
  if (!code || !CODE_PATTERN.test(code)) return;
  const userId = await resolveUserId();
  await postJson("/api/invites/accept", { userId, code });
  removeInviteFromUrl();
}

// 画面の表示は止めない(失敗しても記録できないだけ)
acceptInviteFromUrl().catch((error) => console.error("招待を記録できませんでした", error));
