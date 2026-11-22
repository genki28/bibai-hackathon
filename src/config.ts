import dotenv from "dotenv";

const DEFAULT_PORT = 3000;

export type AppConfig = {
  readonly channelSecret: string;
  readonly channelAccessToken: string;
  readonly liffId: string;
  readonly port: number;
  /** Supabase のプロジェクトの URL(公開してよい値)。 */
  readonly supabaseUrl: string;
  /** Supabase の secret キー(sb_secret_...)。秘密の値。 */
  readonly supabaseSecretKey: string;
  /**
   * テスト用の利用者の切り替えを使えるようにするか(TEST_MODE が "true" のときだけ true)。
   * ⚠ 本番(ハッカソン後)では必ず false にする。docs/05-deploy.md を参照。
   */
  readonly testMode: boolean;
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
    supabaseUrl: env.SUPABASE_URL?.trim() ?? "",
    supabaseSecretKey: env.SUPABASE_SECRET_KEY?.trim() ?? "",
    testMode: env.TEST_MODE?.trim() === "true",
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

/** URL と secret キーの両方があるときだけ Supabase を使う(なければメモリに保存)。 */
export function isSupabaseConfigured(config: AppConfig): boolean {
  return config.supabaseUrl !== "" && config.supabaseSecretKey !== "";
}
