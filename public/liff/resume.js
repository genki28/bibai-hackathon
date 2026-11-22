// 【若者】画面を閉じたあとに「続きに戻る」しくみ。
// go-help.html・ranking.html を開いたとき、参加中の雪かきがあれば、その段階の画面へ自動で移る。
// 行き先の決め方は resume-route.js。?list=1 が付いていたら移らない(下のタブ・「一覧へ」のリンク)。
// お疲れ様の画面を見た依頼は、この端末に覚えておき、もう一度は移らない。

import { callApi, isPreviewMode } from "./common.js";
import { navigateTo } from "./loading.js";
import { pageUrl } from "./request-page.js";
import { resumePageFor, wantsList } from "./resume-route.js";
import { userIdPromise } from "./template.js";

const SEEN_FINISH_KEY = "bibai-seen-finish-ids";
/** 覚えておく件数(多くなりすぎないように)。 */
const MAX_SEEN_FINISH = 20;

function readSeenFinishIds() {
  try {
    const saved = JSON.parse(localStorage.getItem(SEEN_FINISH_KEY) ?? "[]");
    return Array.isArray(saved) ? saved.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

/** お疲れ様の画面を見たことを覚えておく(finish.js から呼ぶ)。 */
export function markFinishSeen(id) {
  try {
    const next = [id, ...readSeenFinishIds().filter((seen) => seen !== id)].slice(0, MAX_SEEN_FINISH);
    localStorage.setItem(SEEN_FINISH_KEY, JSON.stringify(next));
  } catch (error) {
    console.error("お疲れ様の画面を見たことを覚えられませんでした", error);
  }
}

/**
 * 参加中の雪かきがあれば、その段階の画面へ移る。移ったら true(呼んだ画面は何もしないで待つ)。
 * 調べられなかったときは移らずに false(いつもの画面を出す)。
 */
export async function resumeIfActive() {
  if (isPreviewMode() || wantsList(location.search)) return false;
  try {
    const userId = await userIdPromise;
    const active = await callApi(`/api/help-requests/active/${encodeURIComponent(userId)}`);
    const page = resumePageFor(active, userId, { seenFinishIds: readSeenFinishIds() });
    if (!page) return false;
    navigateTo(pageUrl(page, active.id), { replace: true });
    return true;
  } catch (error) {
    console.error("参加中の雪かきを調べられませんでした", error);
    return false;
  }
}
