import type { Metadata } from "next";
import Form from "next/form";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { rateLimit } from "@/lib/rate-limit";
import { formatDate } from "@/lib/store-config";
import { cn } from "@/lib/utils";
import { ActionForm } from "@/components/ActionForm";
import { searchKnowledge, type SearchResult } from "@/lib/knowledge/search";
import { SOURCE_LABEL, type SourceType } from "@/lib/knowledge/sources";
import { EMBED_MODEL, RERANK_MODEL, voyageConfigured } from "@/lib/knowledge/voyage";
import { reindexAction } from "./actions";

export const metadata: Metadata = { title: "AI 知識庫" };

const TYPES = Object.keys(SOURCE_LABEL) as SourceType[];
const EXAMPLES = ["寄送要多少錢", "下雨天穿的外套", "毛衣起毛球怎麼辦", "175 公分 70 公斤穿什麼尺寸", "有優惠碼嗎", "NW012"];

// AI 知識庫（RAG）：小織回答問題時查的資料，以及一個「搜尋測試器」，
// 可以看到每次搜尋的關鍵字分數、語意相似度、重新排序分數，了解 AI 為什麼找到這些資料
export default async function KnowledgePage({ searchParams }: PageProps<"/admin/knowledge">) {
  const user = await requireStaff();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 150) : "";
  const type = typeof sp.type === "string" && TYPES.includes(sp.type as SourceType) ? (sp.type as SourceType) : undefined;

  const [byType, withVectors, latest, chunks] = await Promise.all([
    prisma.knowledgeChunk.groupBy({ by: ["sourceType"], _count: true }),
    prisma.knowledgeChunk.count({ where: { embeddingModel: { not: null } } }),
    prisma.knowledgeChunk.aggregate({ _max: { updatedAt: true } }),
    prisma.knowledgeChunk.findMany({
      where: type ? { sourceType: type } : {},
      orderBy: [{ sourceType: "asc" }, { title: "asc" }],
      select: { id: true, sourceType: true, title: true, content: true, url: true, embeddingModel: true, updatedAt: true },
    }),
  ]);
  const total = byType.reduce((s, x) => s + x._count, 0);

  // 搜尋測試（會呼叫 Voyage，所以限制次數）
  let result: SearchResult | null = null;
  let limited = false;
  if (q) {
    if (await rateLimit(`kb-search:${user.id}`, 20, 60)) result = await searchKnowledge(q, { k: 5, minRerank: 0 });
    else limited = true;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">AI 知識庫</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            小織回答問題時查的資料（RAG）。商品、FAQ、商店規則、優惠碼、購物指南會整理成一段段「知識」，用關鍵字 + 語意搜尋找出最相關的幾段，再交給 AI 回答。
          </p>
        </div>
        <ActionForm action={reindexAction} submitLabel="重建索引" className="flex flex-col items-end gap-2">
          {null}
        </ActionForm>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="知識片段" value={total} />
        <Stat label="已計算語意向量" value={`${withVectors} / ${total}`} tone={withVectors === total && total > 0 ? "ok" : "warn"} />
        <div className="card p-4">
          <p className="text-xs text-muted">搜尋模式</p>
          <p className={cn("mt-1 text-sm font-bold", voyageConfigured() ? "text-ok" : "text-warn")}>
            {voyageConfigured() ? "語意 + 關鍵字 + 重新排序" : "只有關鍵字（未設定 VOYAGE_API_KEY）"}
          </p>
          {voyageConfigured() && <p className="mt-1 text-xs text-muted">{EMBED_MODEL}・{RERANK_MODEL}</p>}
        </div>
        <Stat label="最後更新" value={latest._max.updatedAt ? formatDate(latest._max.updatedAt, true) : "尚未建立"} small />
      </div>

      {/* 搜尋測試器 */}
      <section className="card p-5">
        <h2 className="font-black">搜尋測試器</h2>
        <p className="text-xs text-muted">輸入顧客可能會問的話，看看知識庫會找到哪些資料、各階段的分數。</p>
        <Form action="/admin/knowledge" className="mt-3 flex gap-2">
          <input name="q" defaultValue={q} maxLength={150} placeholder="例如：寄送要多少錢" className="input" aria-label="搜尋問題" />
          <button className="btn-primary shrink-0">搜尋</button>
        </Form>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {EXAMPLES.map((e) => (
            <a key={e} href={`/admin/knowledge?q=${encodeURIComponent(e)}`} className="rounded-sm border border-line bg-white px-2 py-0.5 text-xs hover:border-ink">{e}</a>
          ))}
        </div>

        {limited && <p className="mt-3 text-sm text-bad">搜尋太頻繁，請稍等一分鐘。</p>}
        {result && (
          <div className="mt-4">
            <p className="text-xs text-muted">
              模式：<b>{result.mode}</b>・候選 {result.candidates} 筆・{result.ms}ms{result.tokens ? `・${result.tokens} token` : ""}
            </p>
            {result.note && <p className="mt-1 text-xs font-bold text-warn">{result.note}</p>}
            <ol className="mt-3 space-y-2">
              {result.hits.map((h, i) => (
                <li key={h.id} className="rounded-2xl border border-line bg-white p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-marker text-lg">{i + 1}</span>
                    <span className="badge bg-ink/10">{SOURCE_LABEL[h.sourceType]}</span>
                    <span className="font-bold">{h.title}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    <Score label="關鍵字" value={h.scores.keyword} rank={h.scores.keywordRank} />
                    <Score label="語意相似度" value={h.scores.semantic} rank={h.scores.semanticRank} />
                    <Score label="重新排序" value={h.scores.rerank} highlight />
                  </div>
                  <p className="mt-2 line-clamp-3 text-sm whitespace-pre-wrap text-muted">{h.content}</p>
                </li>
              ))}
              {result.hits.length === 0 && <li className="text-sm text-muted">沒有找到相關資料。</li>}
            </ol>
          </div>
        )}
      </section>

      {/* 知識片段列表 */}
      <section>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <a href="/admin/knowledge" className={cn("rounded-sm border px-3 py-1", !type ? "border-ink bg-ink text-white" : "border-line bg-card")}>全部（{total}）</a>
          {TYPES.map((t) => (
            <a key={t} href={`/admin/knowledge?type=${t}`} className={cn("rounded-sm border px-3 py-1", type === t ? "border-ink bg-ink text-white" : "border-line bg-card")}>
              {SOURCE_LABEL[t]}（{byType.find((b) => b.sourceType === t)?._count ?? 0}）
            </a>
          ))}
        </div>
        <div className="card mt-3 divide-y divide-line overflow-hidden">
          {chunks.map((c) => (
            <details key={c.id} className="group px-4 py-3">
              <summary className="flex cursor-pointer list-none items-center gap-3 text-sm">
                <span className="badge shrink-0 bg-ink/10">{SOURCE_LABEL[c.sourceType as SourceType] ?? c.sourceType}</span>
                <span className="min-w-0 flex-1 truncate font-bold">{c.title}</span>
                <span className={cn("shrink-0 text-xs", c.embeddingModel ? "text-ok" : "text-muted")}>{c.embeddingModel ? "有向量" : "只有關鍵字"}</span>
              </summary>
              <p className="mt-2 text-sm whitespace-pre-wrap text-muted">{c.content}</p>
              <p className="mt-1 text-xs text-muted">更新：{formatDate(c.updatedAt, true)}{c.url && `・連結 ${c.url}`}</p>
            </details>
          ))}
          {chunks.length === 0 && <p className="p-6 text-center text-sm text-muted">知識庫是空的，按右上角「重建索引」建立。</p>}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, tone, small }: { label: string; value: string | number; tone?: "ok" | "warn"; small?: boolean }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className={cn("mt-1 font-marker", small ? "text-lg" : "text-3xl", tone === "ok" && "text-ok", tone === "warn" && "text-warn")}>{value}</p>
    </div>
  );
}

function Score({ label, value, rank, highlight }: { label: string; value: number | null; rank?: number | null; highlight?: boolean }) {
  return (
    <span className={cn("rounded-full border px-2 py-0.5", value == null ? "border-line text-muted" : highlight ? "border-ink bg-ink text-white" : "border-ink/30")}>
      {label}：{value == null ? "—" : value}
      {rank ? `（第 ${rank} 名）` : ""}
    </span>
  );
}
