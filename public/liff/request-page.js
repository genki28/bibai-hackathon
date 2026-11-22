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
 * スリープ・LINE を閉じる・別のアプリへ切り替えるなどで画面が隠れたあと、また見えるようになった瞬間に fn を呼ぶ
 * (visibilitychange と、「戻る」やアプリの切り替えで保存されていた画面が戻ってきたときの pageshow)。
 * やめるときは返り値の関数を呼ぶ。
 */
export function onPageVisible(fn) {
  const onVisibility = () => {
    if (!document.hidden) fn();
  };
  const onPageShow = (event) => {
    if (event.persisted) fn();
  };
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pageshow", onPageShow);
  return () => {
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pageshow", onPageShow);
  };
}

/**
 * 一定の間隔で fn を呼び続ける。fn が true を返したら止める。エラーは表示して続ける。
 * onFirstDone は 1 回目が終わったとき(うまくいってもエラーでも)に 1 度だけ呼ぶ(pageReady を渡す用)。
 * 画面が隠れている間は止めて(電池の節約)、見えるようになった瞬間にすぐ 1 回読み直してから再開する。
 */
export function startPolling(fn, intervalMs, onError, onFirstDone) {
  let timer = null;
  let isStopped = false;
  let isRunning = false;
  let isFirst = true;
  let stopWatchingVisibility = () => {};

  const stop = () => {
    isStopped = true;
    clearTimeout(timer);
    stopWatchingVisibility();
  };
  const scheduleNext = () => {
    clearTimeout(timer);
    // 隠れている間は次を予約しない(見えたら onPageVisible からすぐ呼ぶ)
    if (!isStopped && !document.hidden) timer = setTimeout(tick, intervalMs);
  };
  const tick = async () => {
    // 前の読み直しが終わっていないとき(見えた瞬間と予約が重なったなど)は、重ねて呼ばない
    if (isStopped || isRunning) return;
    isRunning = true;
    clearTimeout(timer);
    let isDone = false;
    try {
      isDone = Boolean(await fn());
    } catch (error) {
      console.error(error);
      onError?.(error);
    } finally {
      isRunning = false;
      if (isFirst) {
        isFirst = false;
        onFirstDone?.();
      }
    }
    if (isDone) {
      stop();
      return;
    }
    scheduleNext();
  };
  // 隠れた瞬間に予約を取り消す。見えた瞬間にすぐ読み直す
  const pauseWhenHidden = () => {
    if (document.hidden) clearTimeout(timer);
  };
  document.addEventListener("visibilitychange", pauseWhenHidden);
  const stopResumeOnVisible = onPageVisible(tick);
  stopWatchingVisibility = () => {
    document.removeEventListener("visibilitychange", pauseWhenHidden);
    stopResumeOnVisible();
  };
  tick();
  return stop;
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
  link.href = "./go-help.html?list=1";
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
