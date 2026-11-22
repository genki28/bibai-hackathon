/**
 * リッチメニュー(= トーク画面の下に出るメニュー)を LINE に登録するスクリプト。
 * タップすると LIFF 画面が開くメニューを 1 つ作り、全員に表示されるメニューに設定する。
 *
 * 使い方: npm run richmenu
 * 画像を変えたいときは assets/richmenu/richmenu.png を差し替える(1200×405 ピクセル)。
 */
import { messagingApi } from "@line/bot-sdk";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { isBotConfigured, isLiffConfigured, loadConfig } from "../src/config.js";

const MENU_NAME = "LIFFを開くメニュー";
const MENU_WIDTH = 1200;
const MENU_HEIGHT = 405;
const IMAGE_PATH = fileURLToPath(
  new URL("../assets/richmenu/richmenu.png", import.meta.url),
);

function buildRichMenu(liffId: string): messagingApi.RichMenuRequest {
  return {
    size: { width: MENU_WIDTH, height: MENU_HEIGHT },
    selected: true,
    name: MENU_NAME,
    chatBarText: "メニュー",
    areas: [
      {
        bounds: { x: 0, y: 0, width: MENU_WIDTH, height: MENU_HEIGHT },
        action: {
          type: "uri",
          label: "アプリを開く",
          uri: `https://liff.line.me/${liffId}`,
        },
      },
    ],
  };
}

/** 前回このスクリプトで作ったメニューを消す(同じものが増え続けないように)。 */
async function deleteOldMenus(
  client: messagingApi.MessagingApiClient,
): Promise<number> {
  const { richmenus } = await client.getRichMenuList();
  const oldMenus = richmenus.filter((menu) => menu.name === MENU_NAME);
  await Promise.all(
    oldMenus.map((menu) => client.deleteRichMenu(menu.richMenuId)),
  );
  return oldMenus.length;
}

async function main(): Promise<void> {
  const config = loadConfig();
  if (!isBotConfigured(config) || !isLiffConfigured(config)) {
    throw new Error(
      ".env に LINE_CHANNEL_SECRET / LINE_CHANNEL_ACCESS_TOKEN / LIFF_ID を入れてから実行してください。",
    );
  }
  const clientConfig = { channelAccessToken: config.channelAccessToken };
  const client = new messagingApi.MessagingApiClient(clientConfig);
  const blobClient = new messagingApi.MessagingApiBlobClient(clientConfig);

  const bot = await client.getBotInfo();
  console.log(`対象の公式アカウント: ${bot.displayName} (${bot.basicId})`);

  const deletedCount = await deleteOldMenus(client);
  const { richMenuId } = await client.createRichMenu(buildRichMenu(config.liffId));
  const image = await readFile(IMAGE_PATH);
  await blobClient.setRichMenuImage(
    richMenuId,
    new Blob([image], { type: "image/png" }),
  );
  await client.setDefaultRichMenu(richMenuId);

  console.log(`古いメニューを ${deletedCount} 件削除しました。`);
  console.log(`リッチメニューを登録しました: ${richMenuId}`);
}

main().catch((error: unknown) => {
  console.error("リッチメニューの登録に失敗しました。", error);
  process.exitCode = 1;
});
