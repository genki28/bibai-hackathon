// 【試作】写真 1 枚から奥行きを推定する AI(Depth Anything V2 Small)を、スマホのブラウザの中で動かす。
// - ライブラリ: Transformers.js(jsdelivr から読む)。モデル: onnx-community/depth-anything-v2-small(Apache-2.0、約 27MB)
// - 使えれば WebGPU(= スマホの画像処理の部品で計算。速い)、だめなら WASM(= ふつうの計算。遅い)
// - 写真はどこにも送らない。モデルのファイルは初回だけダウンロードし、ブラウザにためておく
// 結果は「相対的な奥行き」(近いほど大きい 0〜255)。メートルではない。

const TRANSFORMERS_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2";
const MODEL_ID = "onnx-community/depth-anything-v2-small";

/** 使える計算のしかたを、速い順に。 */
const BACKENDS = Object.freeze([
  { device: "webgpu", dtype: "fp16", label: "WebGPU" },
  { device: "wasm", dtype: "q8", label: "WASM" },
]);

/**
 * 奥行きの AI を読み込む。
 * @param {(text: string) => void} onStatus 進み具合の文字
 * @returns {Promise<{ backend: string, loadMs: number, estimate: (canvas: HTMLCanvasElement) => Promise<{ data: Uint8Array, width: number, height: number, ms: number }> }>}
 */
export async function loadDepthModel(onStatus) {
  const startedAt = performance.now();
  onStatus("AI のライブラリを読み込み中…");
  const { pipeline, RawImage } = await import(TRANSFORMERS_URL);
  const candidates = BACKENDS.filter((b) => b.device !== "webgpu" || "gpu" in navigator);
  let lastError = null;
  for (const backend of candidates) {
    try {
      onStatus(`奥行きの AI を準備中(${backend.label}。初回は 27MB ほどダウンロード)…`);
      const estimator = await pipeline("depth-estimation", MODEL_ID, {
        device: backend.device,
        dtype: backend.dtype,
        progress_callback: (p) => {
          if (p.status === "progress" && typeof p.progress === "number") {
            onStatus(`奥行きの AI をダウンロード中… ${Math.round(p.progress)}%`);
          }
        },
      });
      return {
        backend: backend.label,
        loadMs: performance.now() - startedAt,
        async estimate(canvas) {
          const t0 = performance.now();
          const output = await estimator(RawImage.fromCanvas(canvas));
          const depth = output.depth; // 入力と同じ大きさの、0〜255 の 1 チャンネル画像
          return { data: depth.data, width: depth.width, height: depth.height, ms: performance.now() - t0 };
        },
      };
    } catch (error) {
      console.error(`${backend.label} で奥行きの AI を動かせませんでした`, error);
      lastError = error;
    }
  }
  throw lastError ?? new Error("奥行きの AI を動かせませんでした");
}
