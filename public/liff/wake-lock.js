// 【若者】雪かき中に画面が消えないようにする(Screen Wake Lock API)。
// 画面が消える(スリープする)と、スコップ計も音の実況も止まってしまうため。
// - 使えない端末では何もしない(雪かきはそのまま続けられる)
// - 別のアプリに切り替えるなどで外れたら、画面に戻ったときにもう一度お願いする

/**
 * 画面を消さないようにする。
 * @returns {{ isSupported: boolean }}
 */
export function keepScreenOn() {
  const wakeLock = navigator.wakeLock;
  if (!wakeLock?.request) return { isSupported: false };
  let sentinel = null;

  async function request() {
    if (document.hidden || (sentinel && !sentinel.released)) return;
    try {
      sentinel = await wakeLock.request("screen");
    } catch (error) {
      console.error("画面を消さない設定にできませんでした", error);
    }
  }

  request();
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) request();
  });
  return { isSupported: true };
}
