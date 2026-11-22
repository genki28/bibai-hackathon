import { messagingApi } from "@line/bot-sdk";

/** その人のリッチメニューの紐付けを外す関数を作る。外すと、全員共通の「利用者登録」メニューに戻る。 */
export function createMenuUnlinker(
  channelAccessToken: string,
): (userId: string) => Promise<void> {
  const client = new messagingApi.MessagingApiClient({ channelAccessToken });
  return async (userId) => {
    await client.unlinkRichMenuIdFromUser(userId);
  };
}
