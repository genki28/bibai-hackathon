import { createApp } from "./app.js";
import { isBotConfigured, isLiffConfigured, loadConfig } from "./config.js";

const config = loadConfig();
const app = createApp(config);

function describe(isConfigured: boolean, envNames: string): string {
  return isConfigured ? "設定済み" : `未設定(.env の ${envNames} を入れてください)`;
}

const server = app.listen(config.port, () => {
  const baseUrl = `http://localhost:${config.port}`;
  console.log(`サーバーが起動しました: ${baseUrl}`);
  console.log(`  動作確認   : ${baseUrl}/health`);
  console.log(`  LIFF 画面  : ${baseUrl}/liff/`);
  console.log(`  Bot の受け口: ${baseUrl}/webhook`);
  console.log(
    `  LINE Bot   : ${describe(isBotConfigured(config), "LINE_CHANNEL_SECRET / LINE_CHANNEL_ACCESS_TOKEN")}`,
  );
  console.log(`  LIFF       : ${describe(isLiffConfigured(config), "LIFF_ID")}`);
});

server.on("error", (err: NodeJS.ErrnoException) => {
  const hint =
    err.code === "EADDRINUSE"
      ? `ポート ${config.port} は別のプログラムが使用中です。そちらを止めるか、.env の PORT を変えてください。`
      : "サーバーを起動できませんでした。";
  console.error(hint, err);
  process.exitCode = 1;
});
