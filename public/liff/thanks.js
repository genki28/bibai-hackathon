// 【お年寄り】いいね機能の動き(ひな形)。
// いまは「送る」を押すと画面が切り替わるだけで、まだ保存はしない。

import { byId } from "./common.js";
import "./template.js";

function onSend() {
  // TODO: 選ばれた星(name="stars")と、来てくれた人を保存する API を作ったら、ここで呼ぶ
  byId("step-form").hidden = true;
  byId("step-sent").hidden = false;
}

byId("send-button").addEventListener("click", onSend);
