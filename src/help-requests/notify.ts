/**
 * 若者が参加した(向かい始めた)ときに、依頼したお年寄りの LINE に知らせる。
 * 「〇〇さんが向かっています」と、待機画面(地図で、向かっている人の位置が見える)を開くボタンを送る。
 * - 送るのに失敗しても、参加はそのまま続ける(エラーは記録だけ)
 * - テスト用の利用者や、LINE とつながっていないとき(手元で .env が空)は送らない
 */
import type { messagingApi } from "@line/bot-sdk";
import type { HelpRequest } from "./model.js";

/** お知らせの送り方(LINE の push メッセージ)。テストでは偽物に差し替える。 */
export type PushMessages = (to: string, messages: messagingApi.Message[]) => Promise<void>;
/** 依頼したお年寄りに知らせる。 */
export type NotifyElder = (request: HelpRequest, helperName: string) => Promise<void>;

const WAITING_PAGE = "help-waiting.html";

/** 「〇〇さんが向かっています」のお知らせ(待機画面を開くボタンつき)。 */
export function helperComingMessage(liffId: string, helperName: string): messagingApi.TemplateMessage {
  const text = `${helperName} さんが向かっています!\n画面を開いて、待っていてください。`;
  return {
    type: "template",
    altText: `${helperName} さんが向かっています`,
    template: {
      type: "buttons",
      // ボタンつきのお知らせの文は 160 文字まで(LINE の決まり)
      text: text.slice(0, 160),
      actions: [{ type: "uri", label: "待機画面を開く", uri: `https://liff.line.me/${liffId}/${WAITING_PAGE}` }],
    },
  };
}

export function createElderNotifier(deps: {
  readonly liffId: string;
  readonly push: PushMessages;
  /** 送らない人か(テスト用の利用者など)。 */
  readonly shouldSkip?: (userId: string) => boolean;
}): NotifyElder {
  const shouldSkip = deps.shouldSkip ?? (() => false);
  return async (request, helperName) => {
    if (shouldSkip(request.userId)) return;
    try {
      await deps.push(request.userId, [helperComingMessage(deps.liffId, helperName)]);
    } catch (error) {
      console.error("お年寄りに「向かっています」を送れませんでした", error);
    }
  };
}
