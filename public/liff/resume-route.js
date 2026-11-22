// 【若者】「続きに戻る」の行き先の決め方(画面に触らない、ただの計算。テストは tests/resume-route.test.ts)。
// リッチメニューの「助けに行く」(go-help.html)や ranking.html を開いたとき、
// 参加中の雪かきがあれば、その段階の画面へ自動で移るために使う。

/** URL にこれが付いていたら、自動で移らずに一覧などをそのまま見せる(下のタブ・「一覧へ」のリンク用)。 */
export const LIST_PARAM = "list";

/** 自分で一覧を見たいとき(?list=1)は自動で移らない。 */
export function wantsList(search) {
  return new URLSearchParams(search).get(LIST_PARAM) === "1";
}

/**
 * いま参加している雪かき(GET /api/help-requests/active/:userId の答え)から、戻る画面のファイル名を決める。
 * - 参加したが未到着 → helper-place.html(本人確認の途中で閉じた人もここ。いまの流れでは確認は必須ではない)
 * - 到着済み・開始前 → helper-gather.html
 * - 雪かき中 → helper-working.html(リーダーはそこから範囲の画面へ行ける)
 * - 終わった → finish.html(この端末ですでにお疲れ様の画面を見ていれば移らない)
 * 移らないときは null。
 */
export function resumePageFor(request, userId, { seenFinishIds = [] } = {}) {
  if (!request || !userId) return null;
  const me = request.helpers?.find((h) => h.userId === userId);
  if (!me) return null;
  switch (request.status) {
    case "accepted":
      return me.arrivedAt ? "helper-gather.html" : "helper-place.html";
    case "working":
      return "helper-working.html";
    case "done":
      return seenFinishIds.includes(request.id) ? null : "finish.html";
    default:
      return null;
  }
}
