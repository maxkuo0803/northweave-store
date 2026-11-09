"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/session";
import { rateLimit, TOO_MANY } from "@/lib/rate-limit";
import { reindexAll } from "@/lib/knowledge/indexer";

// 重建知識庫索引：商品、FAQ、規則、優惠、指南全部重新整理，內容有變的才重算向量
export async function reindexAction(): Promise<{ ok?: string; error?: string }> {
  const user = await requireStaff();
  // 展示店員帳號是公開的：限制次數，避免有人一直按把向量額度用光
  if (!(await rateLimit(`kb-reindex:${user.id}`, 3, 600))) return { error: TOO_MANY };
  try {
    const s = await reindexAll();
    revalidatePath("/admin/knowledge");
    return { ok: `完成（${s.mode}）：共 ${s.total} 筆，新增 ${s.created}、更新 ${s.updated}、沒變 ${s.unchanged}、刪除 ${s.deleted}，計算向量 ${s.embedded} 筆（${s.tokens} token）` };
  } catch (e) {
    return { error: `重建失敗：${e instanceof Error ? e.message : e}` };
  }
}
