/**
 * 雪の重さの計算に使う「いまの積雪の深さ(m)」を取ってくる。
 * 天気予報(Open-Meteo、src/weather/forecast.ts)から取り、取れなければ 0.3 m を使う。
 * 何度も問い合わせないよう、取れた値は 30 分覚えておく。
 */
import { currentSnowDepthCm, parseForecast } from "../weather/forecast.js";
import type { FetchForecast } from "../weather/forecast.js";
import { DEFAULT_SNOW_DEPTH_M } from "./score.js";

const CACHE_MS = 30 * 60_000;
/** 天気予報の返事をこれ以上待たない(雪かき終了のボタンを待たせないため)。 */
const FETCH_TIMEOUT_MS = 3000;
const CM_PER_M = 100;

export type GetSnowDepthM = () => Promise<number>;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("天気予報の返事が遅いので、待つのをやめました。")), ms).unref?.();
  });
  return Promise.race([promise, timeout]);
}

export function createSnowDepthProvider(
  fetchForecast: FetchForecast,
  now: () => Date,
): GetSnowDepthM {
  let cached: { readonly depthM: number; readonly at: number } | null = null;

  const load = async (current: Date): Promise<number> => {
    try {
      const hours = parseForecast(await withTimeout(fetchForecast(), FETCH_TIMEOUT_MS));
      const cm = currentSnowDepthCm(hours, current);
      return cm === null ? DEFAULT_SNOW_DEPTH_M : cm / CM_PER_M;
    } catch (error: unknown) {
      console.error("[エラー] 積雪の深さを取れなかったので、0.3m として計算します", error);
      return DEFAULT_SNOW_DEPTH_M;
    }
  };

  return async () => {
    const current = now();
    if (cached && current.getTime() - cached.at < CACHE_MS) return cached.depthM;
    const depthM = await load(current);
    cached = { depthM, at: current.getTime() };
    return depthM;
  };
}
