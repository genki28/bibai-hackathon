import { expect, test } from "vitest";
import { createReplyText } from "../src/bot/reply.js";

test("受け取ったテキストをカギカッコで囲んでオウム返しする", () => {
  // Arrange
  const receivedText = "こんにちは";

  // Act
  const replyText = createReplyText(receivedText);

  // Assert
  expect(replyText).toBe("「こんにちは」ですね!");
});

test("前後の空白は取り除いて返す", () => {
  // Arrange
  const receivedText = "  美唄  ";

  // Act
  const replyText = createReplyText(receivedText);

  // Assert
  expect(replyText).toBe("「美唄」ですね!");
});

test("空白だけのメッセージには、送ってみてくださいと返す", () => {
  // Arrange
  const receivedText = "   ";

  // Act
  const replyText = createReplyText(receivedText);

  // Assert
  expect(replyText).toBe("メッセージを送ってみてください!");
});
