/**
 * リッチメニュー(= トーク画面の下に出るメニュー)を LINE に登録するスクリプト。
 *
 * 3 種類を作る:
 * - 利用者登録メニュー … まだ登録していない人に出す(全員の最初のメニュー)
 * - 助けてほしい人のメニュー … 「たすけて」「登録の変更」
 * - 助けたい人のメニュー … 「助けに行く」「ランキング」「登録の変更」
 *
 * 使い方: npm run richmenu
 * 実行し直すと、前に作ったメニューを消して作り直す(紐付けもリセットされ、全員が登録メニューに戻る)。
 * 画像は assets/richmenu/*.png(1200×405 ピクセル)。見た目を変えたいときは差し替える。
 */
import { messagingApi } from "@line/bot-sdk";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { REGISTER_POSTBACK } from "../src/bot/registration.js";
import { isBotConfigured, isLiffConfigured, loadConfig } from "../src/config.js";
import { MENU_NAMES } from "../src/users/roles.js";

const WIDTH = 1200;
const HEIGHT = 405;
/** 以前のスクリプトで作ったメニューの名前(残っていたら消す)。 */
const OLD_MENU_NAMES = ["LIFFを開くメニュー"];

type MenuKey = keyof typeof MENU_NAMES;
type Area = messagingApi.RichMenuArea;

const imagePath = (key: MenuKey): string =>
  fileURLToPath(new URL(`../assets/richmenu/${key}.png`, import.meta.url));

function area(x: number, width: number, action: messagingApi.Action): Area {
  return { bounds: { x, y: 0, width, height: HEIGHT }, action };
}

const registerAction: messagingApi.Action = {
  type: "postback",
  label: "利用者登録",
  data: REGISTER_POSTBACK,
  displayText: "利用者登録",
};

const changeRoleAction: messagingApi.Action = {
  type: "postback",
  label: "登録の変更",
  data: REGISTER_POSTBACK,
  displayText: "登録の変更",
};

/** 各機能の画面はまだないので、いまは LIFF のトップを開く(画面ができたら差し替える)。 */
const openLiff = (liffId: string, label: string): messagingApi.Action => ({
  type: "uri",
  label,
  uri: `https://liff.line.me/${liffId}`,
});

function buildMenus(liffId: string): Record<MenuKey, messagingApi.RichMenuRequest> {
  const menu = (key: MenuKey, areas: Area[]): messagingApi.RichMenuRequest => ({
    size: { width: WIDTH, height: HEIGHT },
    selected: true,
    name: MENU_NAMES[key],
    chatBarText: "メニュー",
    areas,
  });
  return {
    registration: menu("registration", [area(0, WIDTH, registerAction)]),
    elder: menu("elder", [
      area(0, 800, openLiff(liffId, "たすけて")),
      area(800, 400, changeRoleAction),
    ]),
    helper: menu("helper", [
      area(0, 400, openLiff(liffId, "助けに行く")),
      area(400, 400, openLiff(liffId, "ランキング")),
      area(800, 400, changeRoleAction),
    ]),
  };
}

/** 前にこのスクリプトで作ったメニューを消す(同じものが増え続けないように)。 */
async function deleteOldMenus(client: messagingApi.MessagingApiClient): Promise<number> {
  const names = new Set<string>([...Object.values(MENU_NAMES), ...OLD_MENU_NAMES]);
  const { richmenus } = await client.getRichMenuList();
  const oldMenus = richmenus.filter((m) => names.has(m.name));
  await Promise.all(oldMenus.map((m) => client.deleteRichMenu(m.richMenuId)));
  return oldMenus.length;
}

async function createMenu(
  client: messagingApi.MessagingApiClient,
  blobClient: messagingApi.MessagingApiBlobClient,
  key: MenuKey,
  request: messagingApi.RichMenuRequest,
): Promise<string> {
  const { richMenuId } = await client.createRichMenu(request);
  const image = await readFile(imagePath(key));
  await blobClient.setRichMenuImage(richMenuId, new Blob([image], { type: "image/png" }));
  console.log(`作成しました: ${MENU_NAMES[key]} (${richMenuId})`);
  return richMenuId;
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
  console.log(`古いメニューを ${await deleteOldMenus(client)} 件削除しました。`);

  const menus = buildMenus(config.liffId);
  const registrationId = await createMenu(client, blobClient, "registration", menus.registration);
  await createMenu(client, blobClient, "elder", menus.elder);
  await createMenu(client, blobClient, "helper", menus.helper);

  await client.setDefaultRichMenu(registrationId);
  console.log("「利用者登録メニュー」を、全員の最初のメニューに設定しました。");
}

main().catch((error: unknown) => {
  console.error("リッチメニューの登録に失敗しました。", error);
  process.exitCode = 1;
});
