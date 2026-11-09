import "server-only";

// Voyage AI：把文字轉成「語意向量」（embedding），以及「重新排序」（rerank）搜尋結果。
// Anthropic 推薦的向量服務，支援中文。到 https://dash.voyageai.com 申請 VOYAGE_API_KEY。
// 沒有金鑰時，知識庫自動退回「只用關鍵字搜尋」，網站照常運作。

export const EMBED_MODEL = process.env.VOYAGE_EMBED_MODEL || "voyage-4-lite"; // 最便宜、支援多語言
export const RERANK_MODEL = process.env.VOYAGE_RERANK_MODEL || "rerank-3-lite";
// 向量長度：512 個數字。比預設 1024 省一半儲存空間，資料量小時準確度幾乎一樣
export const EMBED_DIM = 512;

export const voyageConfigured = () => !!process.env.VOYAGE_API_KEY;

async function voyage<T>(path: string, body: object): Promise<T> {
  const res = await fetch(`https://api.voyageai.com/v1/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000), // 最多等 15 秒，超過就放棄（搜尋會退回關鍵字模式）
  });
  if (!res.ok) throw new Error(`Voyage ${path} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json() as Promise<T>;
}

// input_type 很重要：文件用 "document"、搜尋句用 "query"，Voyage 會用不同方式處理，搜尋比較準
export async function embed(texts: string[], inputType: "document" | "query") {
  const out: number[][] = [];
  let tokens = 0;
  // 一次最多送 64 段，避免單次請求太大
  for (let i = 0; i < texts.length; i += 64) {
    const r = await voyage<{ data: { index: number; embedding: number[] }[]; usage: { total_tokens: number } }>("embeddings", {
      input: texts.slice(i, i + 64),
      model: EMBED_MODEL,
      input_type: inputType,
      output_dimension: EMBED_DIM,
    });
    r.data.sort((a, b) => a.index - b.index).forEach((d) => out.push(d.embedding));
    tokens += r.usage.total_tokens;
  }
  return { vectors: out, tokens };
}

// 重新排序：給一個問題和幾段候選文字，回傳每段跟問題的相關程度（0–1），比向量相似度更準
export async function rerank(query: string, documents: string[], topK: number) {
  const r = await voyage<{ data: { index: number; relevance_score: number }[]; usage: { total_tokens: number } }>("rerank", {
    query,
    documents,
    model: RERANK_MODEL,
    top_k: topK,
  });
  return { results: r.data, tokens: r.usage.total_tokens };
}
