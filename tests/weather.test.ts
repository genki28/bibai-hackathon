import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, expect, test } from "vitest";
import { createApp } from "../src/app.js";
import type { AppConfig } from "../src/config.js";
import {
  buildTestWeatherMessage,
  buildWeatherMessage,
  parseForecast,
  summarizeSnow,
} from "../src/weather/forecast.js";
import type { SnowSummary } from "../src/weather/forecast.js";

const CONFIG: AppConfig = {
  channelSecret: "",
  channelAccessToken: "",
  liffId: "",
  port: 0,
};

/** Open-Meteo の応答の形を真似したテスト用データを作る。 */
function makeResponse(snowfall: number[], snowDepthM: number[]): unknown {
  // 2026-11-22 00:00(日本時間)から 1 時間ずつ。Open-Meteo と同じく時差の表記なし
  const start = Date.UTC(2026, 10, 22, 0);
  const time = snowfall.map((_, i) =>
    new Date(start + i * 3_600_000).toISOString().slice(0, 16),
  );
  return {
    hourly_units: { snowfall: "cm", snow_depth: "m" },
    hourly: { time, snowfall, snow_depth: snowDepthM },
  };
}

// 日本時間 2026-11-22 17:30(= UTC 08:30)。夕方に通知を判定する想定
const NOW = new Date("2026-11-22T08:30:00Z");
// 2026-11-22 0 時から 48 時間ぶん。17 = 今日 17 時、31 = 明日 7 時、35 = 明日 11 時
const HOURS = 48;
const TOMORROW_7AM = 31;
const fill = (value: number): number[] => Array(HOURS).fill(value);

const servers: Server[] = [];

afterEach(async () => {
  const closing = servers.splice(0).map(
    (server) => new Promise((resolve) => server.close(resolve)),
  );
  await Promise.all(closing);
});

test("Open-Meteo の応答から 1 時間ごとの降雪量と積雪の深さを取り出す", () => {
  // Arrange
  const raw = makeResponse([0, 1.5], [0.1, 0.12]);

  // Act
  const hours = parseForecast(raw);

  // Assert
  expect(hours).toEqual([
    { time: "2026-11-22T00:00", snowfallCm: 0, snowDepthCm: 10 },
    { time: "2026-11-22T01:00", snowfallCm: 1.5, snowDepthCm: 12 },
  ]);
});

test("Open-Meteo の応答の形がおかしいとエラーにする", () => {
  // Arrange
  const broken = [null, {}, { hourly: { time: ["x"], snowfall: ["a"], snow_depth: [0] } }];

  // Act & Assert
  broken.forEach((raw) => expect(() => parseForecast(raw)).toThrow());
});

test("夕方に、明日のお昼までの降雪量と明日の朝の積雪をまとめる(お昼以降は見ない)", () => {
  // Arrange: 今日 17 時より前と、明日 12 時以降は 99cm にして、数えていないことを確かめる
  const snowfall = Array.from({ length: HOURS }, (_, i) => (i < 17 || i >= 36 ? 99 : 0.6));
  const depth = Array.from({ length: HOURS }, (_, i) => (i === TOMORROW_7AM ? 0.25 : 0.3));
  const hours = parseForecast(makeResponse(snowfall, depth));

  // Act
  const summary = summarizeSnow(hours, NOW);

  // Assert
  expect(summary).toEqual({
    snowfallUntilTomorrowNoonCm: 11.4,
    tomorrowMorningDepthCm: 25,
    isHeavySnow: true,
  });
});

test("降雪が少ないときは大雪ではない", () => {
  // Arrange
  const hours = parseForecast(makeResponse(fill(0.1), fill(0)));

  // Act
  const summary = summarizeSnow(hours, NOW);

  // Assert
  expect(summary.isHeavySnow).toBe(false);
  expect(summary.snowfallUntilTomorrowNoonCm).toBe(1.9);
});

test("大雪のときだけ若者向けの通知文を作る", () => {
  // Arrange
  const heavy: SnowSummary = { snowfallUntilTomorrowNoonCm: 15, tomorrowMorningDepthCm: 30, isHeavySnow: true };
  const light: SnowSummary = { snowfallUntilTomorrowNoonCm: 2, tomorrowMorningDepthCm: 30, isHeavySnow: false };

  // Act
  const heavyMessage = buildWeatherMessage(heavy);
  const lightMessage = buildWeatherMessage(light);

  // Assert
  expect(heavyMessage).toContain("明日の朝");
  expect(heavyMessage).toContain("約30cm");
  expect(heavyMessage).toContain("15cm");
  expect(heavyMessage).toContain("美唄");
  expect(lightMessage).toBeNull();
});

test("テスト送信用の文面は、大雪でなくてもテストと分かる形で明日の予報を伝える", () => {
  // Arrange
  const light: SnowSummary = { snowfallUntilTomorrowNoonCm: 0.1, tomorrowMorningDepthCm: 6, isHeavySnow: false };

  // Act
  const message = buildTestWeatherMessage(light);

  // Assert
  expect(message.startsWith("【テスト送信】")).toBe(true);
  expect(message).toContain("0.1cm");
  expect(message).toContain("約6cm");
});

test("GET /api/weather は美唄の雪のまとめと通知文を返す", async () => {
  // Arrange
  const fakeFetch = async () => makeResponse(fill(1), fill(0.2));
  const server = createApp(CONFIG, { fetchForecast: fakeFetch, now: () => NOW }).listen(0);
  servers.push(server);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;

  // Act
  const response = await fetch(`http://127.0.0.1:${port}/api/weather`);
  const body = await response.json();

  // Assert
  expect(response.status).toBe(200);
  expect(body.success).toBe(true);
  expect(body.data.summary).toEqual({
    snowfallUntilTomorrowNoonCm: 19,
    tomorrowMorningDepthCm: 20,
    isHeavySnow: true,
  });
  expect(body.data.message).toContain("19cm");
});

test("天気が取れないときは 502 と日本語のエラーを返す", async () => {
  // Arrange
  const failingFetch = async () => {
    throw new Error("network down");
  };
  const server = createApp(CONFIG, { fetchForecast: failingFetch }).listen(0);
  servers.push(server);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;

  // Act
  const response = await fetch(`http://127.0.0.1:${port}/api/weather`);
  const body = await response.json();

  // Assert
  expect(response.status).toBe(502);
  expect(body).toEqual({ success: false, error: "天気予報を取得できませんでした。" });
});
