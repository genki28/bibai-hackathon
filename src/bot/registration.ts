/**
 * 利用者登録(助けてほしい / 助けたい を選ぶ)の流れ。
 *
 * 1. 登録用リッチメニューの「利用者登録」を押す → 合図 "action=register" が届く
 * 2. トークに「助けてほしい」「助けたい」の 2 つのボタンを返す
 * 3. どちらかを押す → 合図 "action=set-role&role=..." が届く
 * 4. 役割を保存して、その役割のリッチメニューに切り替える
 *
 * 「合図」は LINE の postback(= ボタンを押したときにこっそり送られるデータ)のこと。
 */
import type { messagingApi } from "@line/bot-sdk";
import { isRole, ROLE_LABELS } from "../users/roles.js";
import type { Role } from "../users/roles.js";
import type { RoleStore } from "../users/store.js";

export type RegistrationCommand =
  | { readonly type: "register" }
  | { readonly type: "set-role"; readonly role: Role };

export type RegistrationDeps = {
  readonly roleStore: RoleStore;
  /** その人に、役割に合ったリッチメニューを付ける。 */
  readonly linkMenu: (userId: string, role: Role) => Promise<void>;
};

export const REGISTER_POSTBACK = "action=register";
const setRolePostback = (role: Role): string => `action=set-role&role=${role}`;

/** ポストバックの合図を読み取る。知らない合図なら null。 */
export function parsePostback(data: string): RegistrationCommand | null {
  const params = new URLSearchParams(data);
  const action = params.get("action");
  if (action === "register") return { type: "register" };
  const role = params.get("role");
  if (action === "set-role" && isRole(role)) return { type: "set-role", role };
  return null;
}

/** 「助けてほしい」「助けたい」を選ぶボタン付きのメッセージ。 */
export function buildRoleChoiceMessage(): messagingApi.TemplateMessage {
  const button = (role: Role): messagingApi.PostbackAction => ({
    type: "postback",
    label: ROLE_LABELS[role],
    data: setRolePostback(role),
    displayText: ROLE_LABELS[role],
  });
  return {
    type: "template",
    altText: "利用者登録: 助けてほしい / 助けたい を選んでください",
    template: {
      type: "buttons",
      title: "利用者登録",
      text: "あてはまる方を押してください",
      actions: [button("elder"), button("helper")],
    },
  };
}

const REGISTERED_GUIDE: Readonly<Record<Role, string>> = {
  elder: "雪かきを頼みたいときは、下のメニューの「たすけて」を押してください。",
  helper: "下のメニューから、助けを待っている人を探せます。",
};

function buildRegisteredMessage(role: Role): messagingApi.TextMessage {
  return {
    type: "text",
    text: [
      `「${ROLE_LABELS[role]}」で登録しました。メニューが切り替わります。`,
      REGISTERED_GUIDE[role],
      "登録を変えたいときは、メニューの「登録の変更」を押してください。",
    ].join("\n"),
  };
}

/** 合図に応じて処理し、返信するメッセージを返す。 */
export async function handleRegistrationPostback(
  command: RegistrationCommand,
  userId: string,
  deps: RegistrationDeps,
): Promise<messagingApi.Message[]> {
  if (command.type === "register") {
    return [buildRoleChoiceMessage()];
  }
  deps.roleStore.setRole(userId, command.role);
  await deps.linkMenu(userId, command.role);
  return [buildRegisteredMessage(command.role)];
}
