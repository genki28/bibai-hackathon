import dotenv from "dotenv";

const DEFAULT_PORT = 3000;

export type AppConfig = {
  readonly channelSecret: string;
  readonly channelAccessToken: string;
  readonly liffId: string;
  readonly port: number;
};

type Env = Readonly<Record<string, string | undefined>>;

function parsePort(value: string | undefined): number {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 ? port : DEFAULT_PORT;
}

/** 環境変数から設定を組み立てる。未設定の項目は空文字になる(それでも起動はできる)。 */
export function readConfig(env: Env): AppConfig {
  return {
    channelSecret: env.LINE_CHANNEL_SECRET?.trim() ?? "",
    channelAccessToken: env.LINE_CHANNEL_ACCESS_TOKEN?.trim() ?? "",
    liffId: env.LIFF_ID?.trim() ?? "",
    port: parsePort(env.PORT),
  };
}

/** .env ファイル(無くてもよい)を読み込んでから設定を返す。 */
export function loadConfig(): AppConfig {
  dotenv.config({ quiet: true });
  return readConfig(process.env);
}

export function isBotConfigured(config: AppConfig): boolean {
  return config.channelSecret !== "" && config.channelAccessToken !== "";
}

export function isLiffConfigured(config: AppConfig): boolean {
  return config.liffId !== "";
}
