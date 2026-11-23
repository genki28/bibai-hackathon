import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, test } from "vitest";
import { createApp } from "../src/app.js";
import type { AppConfig } from "../src/config.js";
import { createElderNotifier, helperComingMessage } from "../src/help-requests/notify.js";
import type { HelpRequest } from "../src/help-requests/model.js";

const CONFIG: AppConfig = {
  channelSecret: "",
  channelAccessToken: "",
  liffId: "",
  port: 0,
  supabaseUrl: "",
  supabaseSecretKey: "",
  testMode: false,
};
// テスト用の架空のユーザー ID
const ELDER_ID = `U${"d".repeat(32)}`;
const HELPER_A = `U${"a".repeat(32)}`;
const LIFF_ID = "1234567890-abcdefgh";

describe("helperComingMessage(向かっていますのお知らせ)", () => {
  test("若者の名前と、待機画面を開くボタン", () => {
    const message = helperComingMessage(LIFF_ID, "若者A");
    expect(message.type).toBe("template");
    const text = JSON.stringify(message);
    expect(text).toContain("若者A さんが向かっています");
    expect(text).toContain(`https://liff.line.me/${LIFF_ID}/help-waiting.html`);
  });
});

describe("createElderNotifier(お年寄りに送る)", () => {
  const request = { userId: ELDER_ID } as HelpRequest;

  test("依頼したお年寄りに、お知らせを 1 通送る", async () => {
    // Arrange
    const sent: Array<{ to: string; messages: unknown[] }> = [];
    const notify = createElderNotifier({
      liffId: LIFF_ID,
      push: async (to, messages) => {
        sent.push({ to, messages });
      },
    });

    // Act
    await notify(request, "若者A");

    // Assert
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(ELDER_ID);
  });

  test("送らない人(テスト用の利用者など)には送らない", async () => {
    const sent: string[] = [];
    const notify = createElderNotifier({
      liffId: LIFF_ID,
      push: async (to) => {
        sent.push(to);
      },
      shouldSkip: (userId) => userId === ELDER_ID,
    });
    await notify(request, "若者A");
    expect(sent).toHaveLength(0);
  });

  test("送るのに失敗しても、エラーを投げない(参加はそのまま続ける)", async () => {
    const notify = createElderNotifier({
      liffId: LIFF_ID,
      push: async () => {
        throw new Error("LINE に送れませんでした");
      },
    });
    await expect(notify(request, "若者A")).resolves.toBeUndefined();
  });
});

const servers: Server[] = [];

afterEach(async () => {
  const closing = servers.splice(0).map((s) => new Promise((resolve) => s.close(resolve)));
  await Promise.all(closing);
});

describe("参加したら、お年寄りに知らせる", () => {
  test("若者が参加すると、その依頼と若者の名前で onJoin が呼ばれる", async () => {
    // Arrange
    const joined: Array<{ elder: string; name: string }> = [];
    const server = createApp(CONFIG, {
      random: () => 0,
      notifyElder: async (request, helperName) => {
        joined.push({ elder: request.userId, name: helperName });
      },
    }).listen(0);
    servers.push(server);
    await new Promise((resolve) => server.once("listening", resolve));
    const { port } = server.address() as AddressInfo;
    const post = (path: string, body: unknown) =>
      fetch(`http://127.0.0.1:${port}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }).then(async (r) => ({ status: r.status, body: await r.json() }));
    const created = await post("/api/help-requests", { userId: ELDER_ID, lat: 43.33, lng: 141.853 });

    // Act
    const result = await post(`/api/help-requests/${created.body.data.id}/join`, {
      userId: HELPER_A,
      displayName: "若者A",
    });

    // Assert
    expect(result.status).toBe(200);
    expect(joined).toEqual([{ elder: ELDER_ID, name: "若者A" }]);
  });
});
