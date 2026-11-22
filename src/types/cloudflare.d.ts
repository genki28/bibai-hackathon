// Cloudflare Workers の中だけで使える部品の型(src/worker.ts で使う)。
// 公式の型パッケージは Node.js の型とぶつかりやすいので、使う分だけ書いている。
declare module "cloudflare:node" {
  /** Node.js の HTTP サーバー(Express)を Workers で動かすための変換。 */
  export function httpServerHandler(options: { port: number }): object;
}

declare module "cloudflare:workers" {
  /** Cloudflare に登録した環境変数・シークレット。 */
  export const env: Readonly<Record<string, string | undefined>>;
}
