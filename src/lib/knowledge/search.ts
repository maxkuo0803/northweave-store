import "server-only";
import { prisma } from "@/lib/prisma";
import { embed, rerank, voyageConfigured } from "./voyage";
import { embedText } from "./indexer";
import type { SourceType } from "./sources";

// 知識庫搜尋（Hybrid RAG）：
//
//   顧客的問題
//     ├─ ① 關鍵字搜尋：字面比對（BM25 演算法，中文用「兩個字一組」切詞）→ 前 20 名
//     ├─ ② 語意搜尋：問題轉成向量，跟每段知識比「意思」接近程度（餘弦相似度）→ 前 20 名
//     ├─ ③ 合併：RRF（倒數排名融合），兩邊都排前面的分數最高 → 前 12 名候選
//     └─ ④ 重新排序：Voyage reranker 逐段判斷「這段能不能回答這個問題」→ 最後前 k 名
//
// 為什麼要兩種一起用？關鍵字擅長精確的東西（商品編號 NW012、優惠碼），
// 語意擅長換句話說（「寄送費」≈「運費」、「下雨穿的」≈「防潑水」）。
// 沒有 Voyage 金鑰時只做 ①，一樣能用。

type Chunk = {
  id: string;
  sourceType: string;
  sourceId: string;
  title: string;
  content: string;
  url: string | null;
  meta: unknown;
  embedding: number[] | null;
  tokens: Map<string, number>; // 關鍵字搜尋用：每個詞出現幾次
  length: number;
};

// ── 切詞：中文兩個字一組，英文數字整個詞（nw012、xl、30） ──
function tokenize(text: string) {
  const t = text.toLowerCase();
  const out: string[] = [];
  for (const w of t.match(/[a-z0-9]+/g) ?? []) out.push(w);
  for (const run of t.match(/[一-鿿]+/g) ?? []) {
    if (run.length === 1) out.push(run);
    for (let i = 0; i < run.length - 1; i++) out.push(run.slice(i, i + 2));
  }
  return out;
}
const countTokens = (text: string) => {
  const m = new Map<string, number>();
  for (const w of tokenize(text)) m.set(w, (m.get(w) ?? 0) + 1);
  return m;
};

// ── 快取：知識庫只有幾百筆，整包放在記憶體裡，有更新才重新讀 ──
let cache: { version: string; chunks: Chunk[]; avgLen: number; df: Map<string, number> } | null = null;

async function loadChunks() {
  const agg = await prisma.knowledgeChunk.aggregate({ _count: true, _max: { updatedAt: true } });
  const version = `${agg._count}:${agg._max.updatedAt?.getTime() ?? 0}`;
  if (cache?.version === version) return cache;
  const rows = await prisma.knowledgeChunk.findMany();
  const chunks: Chunk[] = rows.map((r) => {
    const tokens = countTokens(`${r.title} ${r.title} ${r.content}`); // 標題算兩次：標題命中比較重要
    return {
      ...r,
      embedding: Array.isArray(r.embedding) ? (r.embedding as number[]) : null,
      tokens,
      length: [...tokens.values()].reduce((a, b) => a + b, 0),
    };
  });
  const df = new Map<string, number>(); // 每個詞出現在幾段知識裡（越少見的詞越重要）
  for (const c of chunks) for (const w of c.tokens.keys()) df.set(w, (df.get(w) ?? 0) + 1);
  cache = { version, chunks, df, avgLen: chunks.reduce((s, c) => s + c.length, 0) / Math.max(1, chunks.length) };
  return cache;
}

// BM25：搜尋引擎常用的關鍵字評分方式
function bm25(queryTokens: string[], c: Chunk, df: Map<string, number>, n: number, avgLen: number) {
  const k1 = 1.2, b = 0.75;
  let score = 0;
  for (const w of new Set(queryTokens)) {
    const tf = c.tokens.get(w);
    if (!tf) continue;
    const idf = Math.log(1 + (n - (df.get(w) ?? 0) + 0.5) / ((df.get(w) ?? 0) + 0.5));
    score += idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * c.length) / avgLen)));
  }
  return score;
}

function cosine(a: number[], b: number[]) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

export type SearchHit = {
  id: string;
  sourceType: SourceType;
  sourceId: string;
  title: string;
  content: string;
  url: string | null;
  meta: unknown;
  scores: { keyword: number | null; semantic: number | null; rerank: number | null; keywordRank: number | null; semanticRank: number | null };
};
export type SearchResult = { mode: string; hits: SearchHit[]; candidates: number; tokens: number; ms: number; note?: string };

export async function searchKnowledge(query: string, opts: { types?: SourceType[]; k?: number; minRerank?: number } = {}): Promise<SearchResult> {
  const t0 = Date.now();
  const k = opts.k ?? 5;
  const { chunks: all, df, avgLen } = await loadChunks();
  const now = Date.now();
  const chunks = all.filter((c) => {
    if (opts.types && !opts.types.includes(c.sourceType as SourceType)) return false;
    // 優惠碼可能在索引之後才過期：搜尋時再檢查一次
    const endsAt = (c.meta as { endsAt?: string } | null)?.endsAt;
    return !endsAt || new Date(endsAt).getTime() > now;
  });
  if (!chunks.length) return { mode: "無資料", hits: [], candidates: 0, tokens: 0, ms: Date.now() - t0, note: "知識庫是空的，請先在後台重建索引" };

  // ① 關鍵字
  const qTokens = tokenize(query);
  const kw = chunks.map((c) => ({ c, s: bm25(qTokens, c, df, all.length, avgLen) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 20);
  const kwRank = new Map(kw.map((x, i) => [x.c.id, { rank: i + 1, score: x.s }]));

  // ② 語意（有金鑰、而且知識庫有向量才做）
  let semRank = new Map<string, { rank: number; score: number }>();
  let tokens = 0;
  let note: string | undefined;
  const withVectors = chunks.filter((c) => c.embedding);
  const useVectors = voyageConfigured() && withVectors.length > 0;
  if (useVectors) {
    try {
      const q = await embed([query], "query");
      tokens += q.tokens;
      const sem = withVectors.map((c) => ({ c, s: cosine(q.vectors[0], c.embedding!) })).sort((a, b) => b.s - a.s).slice(0, 20);
      semRank = new Map(sem.map((x, i) => [x.c.id, { rank: i + 1, score: x.s }]));
    } catch (e) {
      note = `語意搜尋失敗，改用關鍵字：${e instanceof Error ? e.message : e}`;
    }
  } else if (voyageConfigured()) {
    note = "知識庫還沒有向量，請到後台「知識庫」重建索引";
  }

  // ③ RRF 合併：分數 = Σ 1 / (60 + 名次)。只看名次，不用煩惱兩種分數單位不同
  const fused = new Map<string, number>();
  for (const m of [kwRank, semRank]) for (const [id, { rank }] of m) fused.set(id, (fused.get(id) ?? 0) + 1 / (60 + rank));
  const candidates = [...fused.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([id]) => chunks.find((c) => c.id === id)!);

  const toHit = (c: Chunk, rr: number | null): SearchHit => ({
    id: c.id,
    sourceType: c.sourceType as SourceType,
    sourceId: c.sourceId,
    title: c.title,
    content: c.content,
    url: c.url,
    meta: c.meta,
    scores: {
      keyword: kwRank.has(c.id) ? +kwRank.get(c.id)!.score.toFixed(2) : null,
      keywordRank: kwRank.get(c.id)?.rank ?? null,
      semantic: semRank.has(c.id) ? +semRank.get(c.id)!.score.toFixed(3) : null,
      semanticRank: semRank.get(c.id)?.rank ?? null,
      rerank: rr,
    },
  });

  // ④ 重新排序
  if (useVectors && semRank.size && candidates.length) {
    try {
      const r = await rerank(query, candidates.map(embedText), Math.min(k, candidates.length));
      tokens += r.tokens;
      const min = opts.minRerank ?? 0.2; // 太不相關的就不給 AI，免得它被誤導
      const hits = r.results.filter((x) => x.relevance_score >= min).map((x) => toHit(candidates[x.index], +x.relevance_score.toFixed(3)));
      return { mode: "語意 + 關鍵字 + 重新排序", hits, candidates: candidates.length, tokens, ms: Date.now() - t0, note };
    } catch (e) {
      note = `重新排序失敗，使用合併排名：${e instanceof Error ? e.message : e}`;
    }
  }
  return {
    mode: semRank.size ? "語意 + 關鍵字" : "只有關鍵字",
    hits: candidates.slice(0, k).map((c) => toHit(c, null)),
    candidates: candidates.length,
    tokens,
    ms: Date.now() - t0,
    note,
  };
}
