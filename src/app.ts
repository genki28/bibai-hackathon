import { JSONParseError, SignatureValidationFailed } from "@line/bot-sdk";
import express from "express";
import type { ErrorRequestHandler, Express, RequestHandler } from "express";
import { fileURLToPath } from "node:url";
import { createWebhookHandlers } from "./bot/webhook.js";
import { isBotConfigured, isLiffConfigured } from "./config.js";
import { createHelpRequestRouter } from "./help-requests/routes.js";
import { createSnowDepthProvider } from "./help-requests/snow-depth.js";
import { createIdentityRouter } from "./identity/routes.js";
import type { IdentityStore } from "./identity/store.js";
import type { HelpRequestStore } from "./help-requests/store.js";
import type { RandomSource } from "./help-requests/leader.js";
import { createInviteRouter } from "./invites/routes.js";
import type { InviteStore } from "./invites/store.js";
import { createStores } from "./storage.js";
import { createTestModeRouter } from "./test-mode/routes.js";
import { TEST_USERS } from "./test-mode/users.js";
import { verifyIdTokenWithLine } from "./users/idToken.js";
import { createMenuUnlinker } from "./users/menu.js";
import { createUsersRouter } from "./users/routes.js";
import type { UsersRouterDeps } from "./users/routes.js";
import { fetchBibaiForecast } from "./weather/forecast.js";
import { createWeatherRouter } from "./weather/routes.js";
import type { WeatherRouterOptions } from "./weather/routes.js";
import type { AppConfig } from "./config.js";


const BOT_NOT_CONFIGURED_MESSAGE =
  "LINE Bot の設定がまだです。.env に LINE_CHANNEL_SECRET と LINE_CHANNEL_ACCESS_TOKEN を入れて、サーバーを再起動してください。";

const botNotConfigured: RequestHandler = (_req, res) => {
  res.status(503).json({ success: false, error: BOT_NOT_CONFIGURED_MESSAGE });
};

const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ success: false, error: "ページが見つかりません。" });
};

/** express.json() が「送られてきた JSON が壊れている」ときに出すエラーかどうか。 */
function isBodyParseError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { type?: unknown }).type === "entity.parse.failed"
  );
}

function toErrorResponse(err: unknown): { status: number; error: string } {
  if (err instanceof SignatureValidationFailed) {
    return { status: 401, error: "LINE の署名を確認できませんでした。" };
  }
  if (err instanceof JSONParseError || isBodyParseError(err)) {
    return { status: 400, error: "リクエストの形式が正しくありません。" };
  }
  return { status: 500, error: "サーバーでエラーが起きました。" };
}

const handleError: ErrorRequestHandler = (err, req, res, _next) => {
  const { status, error } = toErrorResponse(err);
  console.error(`[エラー] ${req.method} ${req.path} (${status})`, err);
  res.status(status).json({ success: false, error });
};

/** Express アプリ(= サーバーの本体)を組み立てて返す。 */
/** テストで外とのやりとりを偽物に差し替えるための設定。ふだんは何も渡さなくてよい。 */
export type AppOptions = WeatherRouterOptions &
  Partial<Pick<UsersRouterDeps, "roleStore" | "verifyIdToken" | "unlinkMenu">> & {
    /**
     * public/ の画面ファイルを Express から配信するか(ふだんは true)。
     * Cloudflare Workers では Cloudflare 側が配信するので false にする(src/worker.ts)。
     */
    readonly serveStatic?: boolean;
    /** 保存先の差し替え(テスト用)。渡さなければ設定に応じて Supabase かメモリを使う。 */
    readonly helpRequestStore?: HelpRequestStore;
    readonly identityStore?: IdentityStore;
    readonly inviteStore?: InviteStore;
    /** リーダーを選ぶときの乱数(テスト用)。helpRequestStore を渡したときは使わない。 */
    readonly random?: RandomSource;
  };

export function createApp(config: AppConfig, options: AppOptions = {}): Express {
  const app = express();
  const botConfigured = isBotConfigured(config);
  const liffConfigured = isLiffConfigured(config);
  // 保存先(Supabase / メモリ)。「誰がどの役割か」は Webhook とメニューを戻す API で同じものを使う
  const stores = createStores(config, { random: options.random });
  const roleStore = options.roleStore ?? stores.roleStore;
  const helpRequestStore = options.helpRequestStore ?? stores.helpRequestStore;
  const identityStore = options.identityStore ?? stores.identityStore;
  const inviteStore = options.inviteStore ?? stores.inviteStore;

  app.get("/health", (_req, res) => {
    res.json({
      success: true,
      data: { status: "ok", botConfigured, liffConfigured },
    });
  });

  // 注意: LINE の署名確認は「生のボディ」が必要。この行より前に express.json() を足さないこと。
  const webhookHandlers = botConfigured
    ? createWebhookHandlers(config, { roleStore })
    : [botNotConfigured];
  app.post("/webhook", ...webhookHandlers);

  // LIFF ID は公開してよい値。シークレットやアクセストークンは絶対に返さない。
  // テストモードのときだけ、テスト用の利用者(架空の人)の一覧も返す(画面の「🧪 テスト」ボタン用)。
  app.get("/api/config", (_req, res) => {
    res.json({
      success: true,
      data: { liffId: config.liffId, testMode: config.testMode, testUsers: config.testMode ? TEST_USERS : [] },
    });
  });

  // 本人確認(マイナンバーカード)のデモ用 API。中で express.json() を使うので /webhook より後に置く。
  app.use(createIdentityRouter(identityStore));
  // テスト用のデータを消す API(TEST_MODE が "true" のときだけ。オフなら下の notFound で 404)
  if (config.testMode) {
    app.use(
      createTestModeRouter({ helpRequestStore, identityStore, roleStore, inviteStore }),
    );
  }
  // 美唄の雪の予報(Open-Meteo)
  app.use(createWeatherRouter(options));
  // お年寄りからの雪かきの依頼と、若者の参加・雪かき・ランキング
  const now = options.now ?? (() => new Date());
  app.use(
    createHelpRequestRouter({
      store: helpRequestStore,
      now,
      getSnowDepthM: createSnowDepthProvider(options.fetchForecast ?? fetchBibaiForecast, now),
      listReferrals: inviteStore.listReferrals,
      // 参加を取り消したら本人確認も取り消す(次に参加するときは、もう一度顔の照合が必要)
      onLeave: identityStore.remove,
    }),
  );
  // 友だちを誘う(招待コード・招待の記録)。勧誘ポイントはランキングで数える
  app.use(createInviteRouter({ store: inviteStore, now }));
  // リッチメニューを最初(利用者登録)に戻す
  app.use(
    createUsersRouter({
      liffId: config.liffId,
      roleStore,
      verifyIdToken: options.verifyIdToken ?? verifyIdTokenWithLine,
      unlinkMenu:
        options.unlinkMenu ?? (botConfigured ? createMenuUnlinker(config.channelAccessToken) : null),
    }),
  );

  app.get("/", (_req, res) => {
    res.redirect("/liff/");
  });
  if (options.serveStatic !== false) {
    app.use(express.static(fileURLToPath(new URL("../public", import.meta.url))));
  }

  app.use(notFound);
  app.use(handleError);
  return app;
}
