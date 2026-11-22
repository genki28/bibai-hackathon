/**
 * Cloudflare Workers(公開用のサーバー)の入口。手元で動かすときは src/server.ts を使う。
 *
 * - 秘密の値は .env ではなく、Cloudflare に登録したシークレットから読む(wrangler secret)
 * - public/ の画面ファイルは Cloudflare が配信する(wrangler.jsonc の assets)
 * - Express のアプリは手元と同じものを使う(httpServerHandler で Workers 用に変換)
 *
 * - データは Supabase に保存する(SUPABASE_URL は wrangler.jsonc の vars、
 *   SUPABASE_SECRET_KEY は wrangler secret)。どちらかがないとメモリに置くので、
 *   Workers ではデータが消えたり、人によって見え方が違ったりする。
 */
import { httpServerHandler } from "cloudflare:node";
import { env } from "cloudflare:workers";
import { createApp } from "./app.js";
import { isSupabaseConfigured, readConfig } from "./config.js";
import { STORAGE_LABELS } from "./storage.js";

const PORT = 8080;

const config = readConfig(env);
console.log(`保存先: ${STORAGE_LABELS[isSupabaseConfigured(config) ? "supabase" : "memory"]}`);
createApp(config, { serveStatic: false }).listen(PORT);

export default httpServerHandler({ port: PORT });
