/**
 * テスト用の利用者(1 台のスマホで、お年寄り役と若者役を行き来してテストするため)。
 * TEST_MODE が "true" のときだけ、画面の「🧪 テスト」ボタンから選べる(GET /api/config で画面に渡す)。
 * ID は LINE のユーザー ID と同じ形(U + 英数字 32 文字)。本物の LINE の ID とはぶつからない、0 が並んだ形にしている。
 * 名前は架空の人だと分かるように「(テスト)」を付ける(ランキングや仲間ゲージに出ても見分けられる)。
 */

export type TestUserRole = "elder" | "helper";

export type TestUser = {
  readonly userId: string;
  /** 画面やランキングに出る名前。 */
  readonly displayName: string;
  /** 「🧪 テスト」の小窓に出す説明。 */
  readonly label: string;
  readonly role: TestUserRole;
};

const testUserId = (suffix: string): string => `U${"0".repeat(32 - suffix.length)}${suffix}`;

export const TEST_USERS: readonly TestUser[] = [
  { userId: testUserId("e1"), displayName: "雪野ばあちゃん(テスト)", label: "テスト用のお年寄り(雪野ばあちゃん)", role: "elder" },
  { userId: testUserId("a1"), displayName: "若者A(テスト)", label: "テスト用の若者 A", role: "helper" },
  { userId: testUserId("b1"), displayName: "若者B(テスト)", label: "テスト用の若者 B", role: "helper" },
  { userId: testUserId("c1"), displayName: "若者C(テスト)", label: "テスト用の若者 C", role: "helper" },
];

export const TEST_USER_IDS: readonly string[] = TEST_USERS.map((user) => user.userId);

export const isTestUserId = (userId: string): boolean => TEST_USER_IDS.includes(userId);
