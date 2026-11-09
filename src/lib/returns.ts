import "server-only";
import { prisma } from "./prisma";
import { getOrderForUser, returnEligibility, returnableQuantities } from "./orders";
import type { ReturnReason, ReturnType } from "@/generated/prisma/enums";

// 建立退換貨申請的「唯一入口」：網站表單和 AI 客服都呼叫這裡，
// 所以鑑賞期、可退數量、換貨庫存這些規則只寫一次，AI 也繞不過去。

export type ReturnItemInput = { orderItemId: string; quantity: number; exchangeVariantId?: string | null };
export type CreateReturnInput = {
  orderNumber: string;
  type: ReturnType;
  reason: ReturnReason;
  description?: string | null;
  items: ReturnItemInput[];
};

// dryRun：只檢查規則、不真的建立（AI 先跟顧客確認內容時用）
export async function createReturn(
  userId: string,
  input: CreateReturnInput,
  opts: { dryRun?: boolean; note?: string } = {},
): Promise<{ ok: true; rmaNumber: string } | { ok: false; error: string }> {
  // 查詢條件一定帶 userId：就算 AI 被騙說出別人的訂單編號，也查不到
  const order = await getOrderForUser(input.orderNumber, userId);
  if (!order) return { ok: false, error: "找不到訂單" };
  const eligible = returnEligibility(order);
  if (!eligible.ok) return { ok: false, error: eligible.reason };
  const remaining = returnableQuantities(order);

  const items: { orderItemId: string; quantity: number; exchangeVariantId: string | null }[] = [];
  for (const req of input.items) {
    const it = order.items.find((i) => i.id === req.orderItemId);
    if (!it) return { ok: false, error: "商品不在這張訂單裡" };
    const qty = req.quantity;
    if (!Number.isInteger(qty) || qty < 0) return { ok: false, error: "數量格式錯誤" };
    if (qty === 0) continue;
    if (qty > remaining[it.id]) return { ok: false, error: `${it.productName} 最多可申請 ${remaining[it.id]} 件` };
    let exchangeVariantId: string | null = null;
    if (input.type === "EXCHANGE") {
      exchangeVariantId = req.exchangeVariantId || null;
      if (!exchangeVariantId) return { ok: false, error: `請選擇 ${it.productName} 要換成的顏色 / 尺寸` };
      // 只能換同一件商品的其他 SKU，且要有庫存
      const target = await prisma.productVariant.findFirst({ where: { id: exchangeVariantId, productId: it.variant?.productId, stock: { gte: qty } } });
      if (!target || target.id === it.variantId) return { ok: false, error: `${it.productName} 要換的尺寸 / 顏色庫存不足` };
    }
    items.push({ orderItemId: it.id, quantity: qty, exchangeVariantId });
  }
  if (items.length === 0) return { ok: false, error: "請至少選擇一件商品" };
  if (opts.dryRun) return { ok: true, rmaNumber: "" };

  const rma = await prisma.returnRequest.create({
    data: {
      // 時間戳 + 亂數，避免同時申請時編號重複
      rmaNumber: `RMA${Date.now().toString().slice(-7)}${Math.floor(Math.random() * 90 + 10)}`,
      orderId: order.id,
      userId,
      type: input.type,
      reason: input.reason,
      description: input.description || null,
      adminNote: opts.note ?? null,
      items: { create: items },
    },
  });
  return { ok: true, rmaNumber: rma.rmaNumber };
}
