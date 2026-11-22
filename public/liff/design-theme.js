// 比較用URLで選んだ見た目は、このタブを閉じるまで引き継ぐ。
// help-request.html はこのファイルを読み込まない。
(() => {
  const key = "snow-design-preview";
  const requested = new URLSearchParams(location.search).get("design");
  const valid = (value) => value === "pixel" || value === "editorial";
  let design = valid(requested) ? requested : "pixel";
  try {
    if (valid(requested)) sessionStorage.setItem(key, requested);
    else if (valid(sessionStorage.getItem(key))) design = sessionStorage.getItem(key);
  } catch { /* 保存できない環境でも、URLの指定は使える。 */ }
  document.documentElement.dataset.design = design;
})();
