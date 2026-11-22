/**
 * 美唄の雪の予報を Open-Meteo(無料・登録不要の天気予報 API)から取ってくる。
 * 商用でない利用は無料。詳しくは https://open-meteo.com/
 */

const BIBAI = { latitude: 43.33, longitude: 141.85 } as const;
const FORECAST_URL =
  "https://api.open-meteo.com/v1/forecast" +
  `?latitude=${BIBAI.latitude}&longitude=${BIBAI.longitude}` +
  "&hourly=snowfall,snow_depth&timezone=Asia%2FTokyo&forecast_days=2";

/** 明日のお昼までにこれ以上降りそうなら「大雪」として若者に知らせる(cm)。 */
export const HEAVY_SNOW_THRESHOLD_CM = 10;
/** 「明日の朝」として積雪の深さを見る時刻(雪かきを始めるころ)。 */
const TOMORROW_MORNING_HOUR = "07";
/** ここより後(お昼以降)の雪は見ない。 */
const TOMORROW_NOON_HOUR = "12";
const HOUR_MS = 3_600_000;
const JST_OFFSET_MS = 9 * HOUR_MS;

export type HourlySnow = {
  readonly time: string; // 日本時間の "YYYY-MM-DDTHH:00"
  readonly snowfallCm: number;
  readonly snowDepthCm: number;
};

export type SnowSummary = {
  readonly snowfallUntilTomorrowNoonCm: number;
  readonly tomorrowMorningDepthCm: number;
  readonly isHeavySnow: boolean;
};

export type FetchForecast = () => Promise<unknown>;

const isNumberArray = (value: unknown): value is number[] =>
  Array.isArray(value) && value.every((v) => typeof v === "number");

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((v) => typeof v === "string");

/** Open-Meteo の応答を確かめてから、使いやすい形に直す。形がおかしければエラー。 */
export function parseForecast(raw: unknown): HourlySnow[] {
  const hourly = (raw as { hourly?: Record<string, unknown> } | null)?.hourly;
  const time = hourly?.time;
  const snowfall = hourly?.snowfall;
  const depth = hourly?.snow_depth;
  const isValid =
    isStringArray(time) &&
    isNumberArray(snowfall) &&
    isNumberArray(depth) &&
    time.length === snowfall.length &&
    time.length === depth.length;
  if (!isValid) {
    throw new Error("天気予報のデータの形が想定と違います。");
  }
  return time.map((t, i) => ({
    time: t,
    snowfallCm: snowfall[i] ?? 0,
    snowDepthCm: Math.round((depth[i] ?? 0) * 100),
  }));
}

/** 日本時間で「何時台か」を Open-Meteo と同じ書き方("YYYY-MM-DDTHH:00")にする。 */
function toJstHour(date: Date): string {
  return `${new Date(date.getTime() + JST_OFFSET_MS).toISOString().slice(0, 13)}:00`;
}

/** 日本時間で「明日」の日付("YYYY-MM-DD")。 */
function toJstTomorrow(now: Date): string {
  return toJstHour(new Date(now.getTime() + 24 * HOUR_MS)).slice(0, 10);
}

const roundToTenth = (value: number): number => Math.round(value * 10) / 10;

/**
 * 夕方に「明日の朝どのくらい積もっているか」を知らせるためのまとめ。
 * いまから明日のお昼までに降る量と、明日の朝(7 時)の積雪の深さを出す。お昼以降は見ない。
 */
export function summarizeSnow(hours: readonly HourlySnow[], now: Date): SnowSummary {
  const tomorrow = toJstTomorrow(now);
  const from = toJstHour(now);
  const until = `${tomorrow}T${TOMORROW_NOON_HOUR}:00`;
  const morning = `${tomorrow}T${TOMORROW_MORNING_HOUR}:00`;
  const upcoming = hours.filter((h) => h.time >= from && h.time < until);
  const snowfallUntilTomorrowNoonCm = roundToTenth(
    upcoming.reduce((sum, h) => sum + h.snowfallCm, 0),
  );
  return {
    snowfallUntilTomorrowNoonCm,
    tomorrowMorningDepthCm: hours.find((h) => h.time === morning)?.snowDepthCm ?? 0,
    isHeavySnow: snowfallUntilTomorrowNoonCm >= HEAVY_SNOW_THRESHOLD_CM,
  };
}

/** いま(日本時間のいまの時間帯)の積雪の深さ(cm)。予報にその時間がなければ null。 */
export function currentSnowDepthCm(hours: readonly HourlySnow[], now: Date): number | null {
  const current = toJstHour(now);
  return hours.find((h) => h.time === current)?.snowDepthCm ?? null;
}

/** 大雪のときだけ若者向けの通知文を返す。大雪でなければ null(= 送らない)。 */
export function buildWeatherMessage(summary: SnowSummary): string | null {
  if (!summary.isHeavySnow) return null;
  return [
    `❄ 明日の朝、美唄は積雪 約${summary.tomorrowMorningDepthCm}cm になりそうです。`,
    `(明日のお昼までに ${summary.snowfallUntilTomorrowNoonCm}cm 降る予想)`,
    "明日は雪かきの出番です。助けを待っている人がいたら、ぜひ行ってみてください!",
  ].join("\n");
}

/** 通知が届くかを試すための文面。大雪でなくても、明日の予報をテストと分かる形で伝える。 */
export function buildTestWeatherMessage(summary: SnowSummary): string {
  return [
    "【テスト送信】雪かきアプリの天気通知のテストです。",
    `明日の朝の美唄の積雪: 約${summary.tomorrowMorningDepthCm}cm`,
    `明日のお昼までの降雪: ${summary.snowfallUntilTomorrowNoonCm}cm`,
  ].join("\n");
}

/** Open-Meteo から美唄の予報を取ってくる(そのままの形で返す)。 */
export const fetchBibaiForecast: FetchForecast = async () => {
  const response = await fetch(FORECAST_URL);
  if (!response.ok) {
    throw new Error(`Open-Meteo が ${response.status} を返しました。`);
  }
  return response.json();
};
