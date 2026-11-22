/**
 * Cloudflare Workers(公開用のサーバー)の入口。手元で動かすときは src/server.ts を使う。
 *
 * - 秘密の値は .env ではなく、Cloudflare に登録したシークレットから読む(wrangler secret)
 * - public/ の画面ファイルは Cloudflare が配信する(wrangler.jsonc の assets)
 * - Express のアプリは手元と同じものを使う(httpServerHandler で Workers 用に変換)
 *
 * 注意: Workers はリクエストごとに別の場所で動くことがあり、メモリに置いたデータ
 * (役割・依頼・本人確認の結果)は消えたり、人によって見え方が違ったりする。
 * ちゃんと残すには Supabase につなぐ必要がある。
 */
import { httpServerHandler } from "cloudflare:node";
import { env } from "cloudflare:workers";
import { createApp } from "./app.js";
import { readConfig } from "./config.js";

const PORT = 8080;

createApp(readConfig(env), { serveStatic: false }).listen(PORT);

export default httpServerHandler({ port: PORT });
