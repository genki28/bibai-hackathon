import { expect, test } from "vitest";
import { isBotConfigured, isLiffConfigured, readConfig } from "../src/config.js";

test("環境変数が空でも設定を作れて、ポートは 3000 になる", () => {
  // Arrange
  const env = {};

  // Act
  const config = readConfig(env);

  // Assert
  expect(config.port).toBe(3000);
  expect(isBotConfigured(config)).toBe(false);
  expect(isLiffConfigured(config)).toBe(false);
});

test("PORT が数字でないときは 3000 を使う", () => {
  // Arrange
  const env = { PORT: "abc" };

  // Act
  const config = readConfig(env);

  // Assert
  expect(config.port).toBe(3000);
});

test("シークレットとトークンの両方があるときだけ Bot は設定済みになる", () => {
  // Arrange
  const onlySecret = { LINE_CHANNEL_SECRET: "dummy-secret" };
  const both = { ...onlySecret, LINE_CHANNEL_ACCESS_TOKEN: "dummy-token" };

  // Act
  const results = [onlySecret, both].map((env) => isBotConfigured(readConfig(env)));

  // Assert
  expect(results).toEqual([false, true]);
});
