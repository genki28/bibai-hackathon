/**
 * 美唄の雪の予報を見て、明日の朝までに大雪になりそうなら友だち全員に LINE で知らせるスクリプト。
 * 毎日夕方(17 時)に動かす想定。
 *
 * 使い方:
 *   npm run notify:weather                    … 送らずに、送る予定の文面を表示するだけ(おためし)
 *   npm run notify:weather -- --send          … 大雪なら本当に送る(友だち全員に届くので注意)
 *   npm run notify:weather -- --send --force  … 大雪でなくても「テスト送信」として今の予報を送る
 *
 * あとで Cloudflare Workers の Cron Triggers(= 決まった時間に動かす仕組み)から呼ぶ想定。
 */
import { messagingApi } from "@line/bot-sdk";
import { isBotConfigured, loadConfig } from "../src/config.js";
import {
  buildTestWeatherMessage,
  buildWeatherMessage,
  fetchBibaiForecast,
  parseForecast,
  summarizeSnow,
} from "../src/weather/forecast.js";
import type { SnowSummary } from "../src/weather/forecast.js";

function chooseMessage(summary: SnowSummary, isForced: boolean): string | null {
  return buildWeatherMessage(summary) ?? (isForced ? buildTestWeatherMessage(summary) : null);
}

async function broadcast(text: string): Promise<void> {
  const config = loadConfig();
  if (!isBotConfigured(config)) {
    throw new Error(".env に LINE_CHANNEL_SECRET と LINE_CHANNEL_ACCESS_TOKEN を入れてください。");
  }
  const client = new messagingApi.MessagingApiClient({
    channelAccessToken: config.channelAccessToken,
  });
  await client.broadcast({ messages: [{ type: "text", text }] });
}

async function main(): Promise<void> {
  const shouldSend = process.argv.includes("--send");
  const isForced = process.argv.includes("--force");
  const summary = summarizeSnow(parseForecast(await fetchBibaiForecast()), new Date());
  console.log(
    `美唄の予報: 明日のお昼までの降雪 ${summary.snowfallUntilTomorrowNoonCm}cm / 明日の朝の積雪 約${summary.tomorrowMorningDepthCm}cm`,
  );

  const message = chooseMessage(summary, isForced);
  if (!message) {
    console.log("大雪ではないので、通知は送りません。");
    return;
  }
  console.log(`--- 送る文面 ---\n${message}\n---------------`);

  if (!shouldSend) {
    console.log("おためしなので送っていません。送るときは -- --send を付けてください。");
    return;
  }
  await broadcast(message);
  console.log("友だち全員に送りました。");
}

main().catch((error: unknown) => {
  console.error("天気の通知に失敗しました。", error);
  process.exitCode = 1;
});
