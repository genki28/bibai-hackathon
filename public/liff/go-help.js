// 【若者】助けに行くページの動き(ひな形)。
// 一覧 → 大まかな地図 → 確認、を画面の切り替えだけで行き来する。依頼の件数だけは本物を出す。

import { byId, callApi, isPreviewMode } from "./common.js";
import "./template.js";

const STEPS = ["list", "map", "confirm"];

function showStep(name) {
  STEPS.forEach((step) => {
    byId(`step-${step}`).hidden = step !== name;
  });
}

async function showWaitingCount() {
  if (isPreviewMode()) {
    byId("waiting-count").textContent = "(おためし表示)いま 0 件、助けを待っています。";
    return;
  }
  const requests = await callApi("/api/help-requests");
  byId("waiting-count").textContent = `いま ${requests.length} 件、助けを待っています。`;
}

byId("to-map-button").addEventListener("click", () => showStep("map"));
byId("back-to-list-button").addEventListener("click", () => showStep("list"));
byId("choose-button").addEventListener("click", () => showStep("confirm"));
byId("cancel-choose-button").addEventListener("click", () => showStep("map"));

showWaitingCount().catch((error) => {
  console.error(error);
  byId("waiting-count").textContent = "依頼を読み込めませんでした。";
});
