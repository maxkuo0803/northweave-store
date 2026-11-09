import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { EMBED_MODEL, embed, voyageConfigured } from "./voyage";
import { allChunks, productChunks, type ChunkInput, type SourceType } from "./sources";

// 建立 / 更新知識庫索引：
// 1. 從商品、FAQ、規則、優惠、指南產生最新的知識片段
// 2. 內容有變的才重新算向量（用內容的 hash 比對，沒變就跳過 → 省錢省時間）
// 3. 已經不存在的（下架商品、過期優惠）從知識庫刪掉

const hashOf = (c: ChunkInput) => createHash("sha256").update(`${c.title}\n${c.content}\n${c.url ?? ""}`).digest("hex").slice(0, 32);
export const embedText = (c: { title: string; content: string }) => `${c.title}\n${c.content}`;

export type IndexStats = { total: number; created: number; updated: number; unchanged: number; deleted: number; embedded: number; tokens: number; mode: "語意 + 關鍵字" | "只有關鍵字" };

async function upsertChunks(chunks: ChunkInput[], prune: { sourceTypes: SourceType[] } | { sourceType: SourceType; sourceIds: string[] } | null): Promise<IndexStats> {
  const useVectors = voyageConfigured();
  const existing = await prisma.knowledgeChunk.findMany({
    select: { id: true, sourceType: true, sourceId: true, contentHash: true, embeddingModel: true },
  });
  const byKey = new Map(existing.map((e) => [`${e.sourceType}:${e.sourceId}`, e]));

  const stats: IndexStats = { total: chunks.length, created: 0, updated: 0, unchanged: 0, deleted: 0, embedded: 0, tokens: 0, mode: useVectors ? "語意 + 關鍵字" : "只有關鍵字" };
  const work = chunks.map((c) => {
    const old = byKey.get(`${c.sourceType}:${c.sourceId}`);
    const hash = hashOf(c);
    const contentChanged = !old || old.contentHash !== hash;
    // 需要算向量：內容變了，或是之前沒有向量 / 換了向量模型
    const needsVector = useVectors && (contentChanged || old?.embeddingModel !== EMBED_MODEL);
    return { c, old, hash, contentChanged, needsVector };
  });

  // 一次把需要的向量都算好（批次比較快）
  const vectors = new Map<number, number[]>();
  const toEmbed = work.map((w, i) => (w.needsVector ? i : -1)).filter((i) => i >= 0);
  if (toEmbed.length) {
    const r = await embed(toEmbed.map((i) => embedText(work[i].c)), "document");
    toEmbed.forEach((i, j) => vectors.set(i, r.vectors[j]));
    stats.embedded = toEmbed.length;
    stats.tokens = r.tokens;
  }

  for (const [i, w] of work.entries()) {
    if (!w.contentChanged && !w.needsVector) {
      stats.unchanged++;
      continue;
    }
    const vector = vectors.get(i);
    const data = {
      title: w.c.title,
      content: w.c.content,
      url: w.c.url ?? null,
      meta: (w.c.meta ?? undefined) as Prisma.InputJsonValue | undefined,
      contentHash: w.hash,
      // 內容變了但沒有 Voyage 金鑰：把舊向量清掉（舊向量代表的是舊內容，會搜錯）
      ...(vector ? { embedding: vector, embeddingModel: EMBED_MODEL } : w.contentChanged ? { embedding: Prisma.DbNull, embeddingModel: null } : {}),
    };
    if (w.old) {
      await prisma.knowledgeChunk.update({ where: { id: w.old.id }, data });
      stats.updated++;
    } else {
      await prisma.knowledgeChunk.create({ data: { sourceType: w.c.sourceType, sourceId: w.c.sourceId, ...data } });
      stats.created++;
    }
  }

  // 刪掉已經不存在的片段
  if (prune) {
    const keep = new Set(chunks.map((c) => `${c.sourceType}:${c.sourceId}`));
    const stale = existing.filter((e) =>
      "sourceTypes" in prune
        ? prune.sourceTypes.includes(e.sourceType as SourceType) && !keep.has(`${e.sourceType}:${e.sourceId}`)
        : e.sourceType === prune.sourceType && prune.sourceIds.includes(e.sourceId) && !keep.has(`${e.sourceType}:${e.sourceId}`),
    );
    if (stale.length) await prisma.knowledgeChunk.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
    stats.deleted = stale.length;
  }
  return stats;
}

// 全部重建（後台按鈕、部署後執行 npm run kb:index）
export async function reindexAll() {
  return upsertChunks(await allChunks(), { sourceTypes: ["PRODUCT", "FAQ", "POLICY", "GUIDE", "PROMO"] });
}

// 只更新一件商品（後台改商品後自動呼叫）；商品下架就從知識庫移除
export async function reindexProduct(productId: string) {
  return upsertChunks(await productChunks({ id: productId }), { sourceType: "PRODUCT", sourceIds: [productId] });
}
