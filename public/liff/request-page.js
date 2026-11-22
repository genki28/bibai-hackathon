// 依頼 1 件を扱う画面(場所・待機中・雪かき中・範囲・お疲れ様など)で共通に使う処理。
// 注意: 画面に文字を入れるときは必ず textContent を使う(innerHTML は使わない)。

import { byId, callApi, postJson } from "./common.js";

const ID_PATTERN = /^[0-9a-f-]{36}$/;

/** URL の ?id= から依頼 ID を読む。形がおかしければ null。 */
export function requestIdFromUrl() {
  const id = new URLSearchParams(location.search).get("id") ?? "";
  return ID_PATTERN.test(id) ? id : null;
}

/** 同じフォルダの画面の URL(?id= 付き)。 */
export const pageUrl = (page, id) => `./${page}?id=${encodeURIComponent(id)}`;

/** 依頼の詳細を、見る人(userId)に合わせた形で取ってくる。 */
export const fetchRequest = (id, userId) =>
  callApi(`/api/help-requests/${id}?userId=${encodeURIComponent(userId)}`);

/** POST /api/help-requests/:id/{action} を呼ぶ。 */
export const postAction = (id, action, data) => postJson(`/api/help-requests/${id}/${action}`, data);

/**
 * 一定の間隔で fn を呼び続ける。fn が true を返したら止める。エラーは表示して続ける。
 * onFirstDone は 1 回目が終わったとき(うまくいってもエラーでも)に 1 度だけ呼ぶ(pageReady を渡す用)。
 */
export function startPolling(fn, intervalMs, onError, onFirstDone) {
  let timer = null;
  let isStopped = false;
  let isFirst = true;
  const tick = async () => {
    try {
      if (await fn()) return;
    } catch (error) {
      console.error(error);
      onError?.(error);
    } finally {
      if (isFirst) {
        isFirst = false;
        onFirstDone?.();
      }
    }
    if (!isStopped) timer = setTimeout(tick, intervalMs);
  };
  tick();
  return () => {
    isStopped = true;
    clearTimeout(timer);
  };
}

/** id="error" の場所にメッセージを出す(空なら隠す)。 */
export function showError(message) {
  const error = byId("error");
  if (!error) return;
  error.textContent = message;
  error.hidden = message === "";
}

/** 見出しとメッセージだけの画面にする(依頼が見つからない・取り消された など)。 */
export function showMessageOnly(title, message) {
  const main = document.querySelector("main");
  const heading = document.createElement("h1");
  heading.textContent = title;
  const text = document.createElement("p");
  text.textContent = message;
  const link = document.createElement("a");
  link.className = "button";
  link.href = "./go-help.html";
  link.textContent = "ほかの依頼をさがす";
  main.replaceChildren(heading, text, link);
}

/** 依頼が取り消された・参加していない など、続けられないときの表示。続けられれば false。 */
export function stopIfUnavailable(request) {
  if (request.status === "cancelled") {
    showMessageOnly("依頼が取り消されました", "お願いした人が、この依頼を取り消しました。");
    return true;
  }
  if (request.viewer !== "helper") {
    showMessageOnly("この依頼に参加していません", "「助けに行く」から、行きたい依頼を選んでください。");
    return true;
  }
  return false;
}

/** 要素を作って文字を入れる(textContent を使う)。 */
export function el(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}
