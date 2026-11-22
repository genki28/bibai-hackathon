/**
 * Bot の「中身」です。受け取ったテキストから、返信するテキストを作ります。
 * Bot の返事を変えたいときは、この関数を書き換えてください。
 */
export function createReplyText(receivedText: string): string {
  const text = receivedText.trim();
  if (text === "") {
    return "メッセージを送ってみてください!";
  }
  return `「${text}」ですね!`;
}
