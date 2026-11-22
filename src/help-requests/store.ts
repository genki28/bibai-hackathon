/**
 * お年寄りからの「雪かきの依頼」を覚えておく場所。
 * いまはサーバーのメモリに置いているので、再起動すると消える(Supabase につなぐときに置き換える)。
 * 場所(住所)はまだ扱わない。最初の 1 回だけ登録する仕組みを、あとで足す。
 */
import { randomUUID } from "node:crypto";
import { isValidUserId } from "../identity/store.js";

/** 雪の量。little = すこし、normal = ふつう(未選択)、lots = たくさん。 */
export type SnowAmount = "little" | "normal" | "lots";
export type HelpRequestStatus = "waiting";

export type HelpRequestInput = {
  readonly userId: string;
  readonly amount: SnowAmount;
};

export type HelpRequest = HelpRequestInput & {
  readonly id: string;
  readonly status: HelpRequestStatus;
  readonly createdAt: string;
};

export type HelpRequestStore = {
  /** 依頼を登録する。同じ人の「待っている」依頼があれば、新しく作らずそれを返す。 */
  readonly create: (input: HelpRequestInput, now: Date) => HelpRequest;
  readonly listWaiting: () => readonly HelpRequest[];
};

const SNOW_AMOUNTS: readonly SnowAmount[] = ["little", "normal", "lots"];
const isSnowAmount = (value: unknown): value is SnowAmount =>
  typeof value === "string" && (SNOW_AMOUNTS as readonly string[]).includes(value);

/** 外から届いた入力を確かめる。おかしければ null。 */
export function parseHelpRequestInput(raw: unknown): HelpRequestInput | null {
  const body = (raw ?? {}) as { userId?: unknown; amount?: unknown };
  if (!isValidUserId(body.userId)) return null;
  const amount = body.amount ?? "normal";
  if (!isSnowAmount(amount)) return null;
  return { userId: body.userId, amount };
}

export function createHelpRequestStore(): HelpRequestStore {
  let requests: readonly HelpRequest[] = [];

  const listWaiting = (): readonly HelpRequest[] =>
    requests.filter((r) => r.status === "waiting");

  return {
    listWaiting,
    create: (input, now) => {
      const existing = listWaiting().find((r) => r.userId === input.userId);
      if (existing) return existing;
      const created: HelpRequest = {
        ...input,
        id: randomUUID(),
        status: "waiting",
        createdAt: now.toISOString(),
      };
      requests = [...requests, created];
      return created;
    },
  };
}
