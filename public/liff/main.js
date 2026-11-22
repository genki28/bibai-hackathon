// LIFF 画面の動き。画面を変えたいときは index.html とこのファイルを書き換えてください。
// 注意: 画面に文字を入れるときは必ず textContent を使う(innerHTML は使わない)。

import { fetchAppConfig, resolveOwnProfile } from "./common.js";
import { pageReady } from "./loading.js";
import "./reset-menu-button.js";
import "./test-mode.js";

const byId = (id) => document.getElementById(id);

function showStatus(message, isError = false) {
  const status = byId("status");
  status.textContent = message;
  status.classList.toggle("error", isError);
}

async function fetchDisplayName(liff) {
  if (!liff.isLoggedIn()) {
    return "(ログインすると表示されます)";
  }
  const profile = await liff.getProfile();
  return profile.displayName;
}

async function showDetails(liff) {
  const isLoggedIn = liff.isLoggedIn();
  byId("where").textContent = liff.isInClient() ? "LINE アプリの中" : "ふつうのブラウザ";
  byId("login").textContent = isLoggedIn ? "ログイン中" : "ログインしていません";
  byId("name").textContent = await fetchDisplayName(liff);
  byId("details").hidden = false;

  const loginButton = byId("login-button");
  loginButton.hidden = isLoggedIn;
  loginButton.addEventListener("click", () => liff.login());
}

/** 美唄の雪の予報を表示する。失敗しても画面の他の部分は動くようにする。 */
async function showWeather() {
  const text = byId("weather-text");
  try {
    const response = await fetch("/api/weather");
    const body = await response.json();
    if (!response.ok || !body?.success) throw new Error(body?.error ?? String(response.status));
    const { summary } = body.data;
    const lines = [
      `明日の朝の積雪: 約${summary.tomorrowMorningDepthCm}cm`,
      `明日のお昼までの降雪: ${summary.snowfallUntilTomorrowNoonCm}cm`,
    ];
    text.textContent = summary.isHeavySnow
      ? `${lines.join("\n")}\n明日は大雪になりそうです。雪かきの出番です!`
      : lines.join("\n");
  } catch (error) {
    console.error(error);
    text.textContent = "天気予報を取得できませんでした。";
  }
}

async function main() {
  showWeather();
  const liff = window.liff;
  if (!liff) {
    showStatus("LIFF SDK を読み込めませんでした。ネット接続を確認してください。", true);
    return;
  }
  const { liffId } = await fetchAppConfig();
  if (!liffId) {
    showStatus("LIFF ID が未設定です。.env の LIFF_ID に値を入れて、サーバーを再起動してください。", true);
    return;
  }
  // liff.init は common.js で 1 回だけ行う(テスト用の切り替えなど、ほかの部品と同じ準備を使う)
  await resolveOwnProfile();
  await showDetails(liff);
  showStatus("LIFF の準備ができました。");
}

main()
  .catch((error) => {
    console.error(error);
    showStatus(`エラーが起きました: ${error instanceof Error ? error.message : String(error)}`, true);
  })
  .finally(pageReady);
