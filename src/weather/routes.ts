import express from "express";
import type { Router } from "express";
import {
  buildWeatherMessage,
  fetchBibaiForecast,
  parseForecast,
  summarizeSnow,
} from "./forecast.js";
import type { FetchForecast } from "./forecast.js";

export type WeatherRouterOptions = {
  readonly fetchForecast?: FetchForecast;
  readonly now?: () => Date;
};

/** GET /api/weather … 美唄の雪のまとめと、通知するならその文面を返す。 */
export function createWeatherRouter(options: WeatherRouterOptions = {}): Router {
  const fetchForecast = options.fetchForecast ?? fetchBibaiForecast;
  const now = options.now ?? (() => new Date());
  const router = express.Router();

  router.get("/api/weather", async (_req, res) => {
    try {
      const summary = summarizeSnow(parseForecast(await fetchForecast()), now());
      res.json({ success: true, data: { summary, message: buildWeatherMessage(summary) } });
    } catch (error: unknown) {
      console.error("[エラー] 天気予報の取得に失敗しました", error);
      res.status(502).json({ success: false, error: "天気予報を取得できませんでした。" });
    }
  });

  return router;
}
