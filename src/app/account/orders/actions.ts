"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { CANCELLABLE, getOrderForUser, returnEligibility, returnableQuantities } from "@/lib/orders";

export async function cancelOrderAction(formData: FormData) {
  const orderNumber = String(formData.get("orderNumber"));
  const user = await requireUser(`/account/orders/${orderNumber}`);
  const order = await prisma.order.findFirst({ where: { orderNumber, userId: user.id }, include: { items: true } });
  if (!order || !CANCELLABLE.includes(order.status)) return;

  await prisma.$transaction(async (tx) => {
    // 歸還庫存
    for (const it of order.items) {
      if (it.variantId) await tx.productVariant.update({ where: { id: it.variantId }, data: { stock: { increment: it.quantity } } });
    }
    await tx.order.update({
      where: { id: order.id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        paymentStatus: order.paymentStatus === "PAID" ? "REFUNDED" : order.paymentStatus,
        history: { create: { status: "CANCELLED", note: order.paymentStatus === "PAID" ? "顧客取消訂單，款項將於 3–5 個工作天退回" : "顧客取消訂單" } },
      },
    });
  });
  revalidatePath("/", "layout");
}

// 模擬 ATM 完成轉帳（正式環境是金流商用 webhook 通知我們）
export async function simulatePaymentAction(formData: FormData) {
  const orderNumber = String(formData.get("orderNumber"));
  const user = await requireUser(`/account/orders/${orderNumber}`);
  const order = await prisma.order.findFirst({ where: { orderNumber, userId: user.id } });
  if (!order || order.status !== "PENDING_PAYMENT") return;
  await prisma.order.update({
    where: { id: order.id },
    data: { status: "PAID", paymentStatus: "PAID", paidAt: new Date(), history: { create: { status: "PAID", note: "ATM 轉帳入帳（模擬）" } } },
  });
  revalidatePath("/", "layout");
}

export type ReturnFormState = { error?: string } | undefined;

const returnSchema = z.object({
  orderNumber: z.string(),
  type: z.enum(["RETURN", "EXCHANGE"]),
  reason: z.enum(["SIZE_TOO_SMALL", "SIZE_TOO_LARGE", "DEFECTIVE", "WRONG_ITEM", "NOT_AS_DESCRIBED", "CHANGED_MIND"]),
  description: z.string().max(500).optional(),
});

export async function createReturnAction(_: ReturnFormState, formData: FormData): Promise<ReturnFormState> {
  const parsed = returnSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "請選擇退換貨類型與原因" };
  const { orderNumber, type, reason, description } = parsed.data;
  const user = await requireUser(`/account/orders/${orderNumber}`);

  const order = await getOrderForUser(orderNumber, user.id);
  if (!order) return { error: "找不到訂單" };
  const eligible = returnEligibility(order);
  if (!eligible.ok) return { error: eligible.reason };
  const remaining = returnableQuantities(order);

  // 表單欄位：qty_<orderItemId>、exchange_<orderItemId>
  const items: { orderItemId: string; quantity: number; exchangeVariantId: string | null }[] = [];
  for (const it of order.items) {
    const qty = Number(formData.get(`qty_${it.id}`) ?? 0);
    if (!Number.isInteger(qty)) return { error: "數量格式錯誤" };
    if (!qty) continue;
    if (qty < 0 || qty > remaining[it.id]) return { error: `${it.productName} 最多可申請 ${remaining[it.id]} 件` };
    let exchangeVariantId: string | null = null;
    if (type === "EXCHANGE") {
      exchangeVariantId = String(formData.get(`exchange_${it.id}`) ?? "") || null;
      if (!exchangeVariantId) return { error: `請選擇 ${it.productName} 要換成的顏色 / 尺寸` };
      // 只能換同一件商品的其他 SKU，且要有庫存
      const target = await prisma.productVariant.findFirst({ where: { id: exchangeVariantId, productId: it.variant?.productId, stock: { gte: qty } } });
      if (!target || target.id === it.variantId) return { error: `${it.productName} 要換的尺寸 / 顏色庫存不足` };
    }
    items.push({ orderItemId: it.id, quantity: qty, exchangeVariantId });
  }
  if (items.length === 0) return { error: "請至少選擇一件商品" };

  const rma = await prisma.returnRequest.create({
    data: {
      // 時間戳 + 亂數，避免同時申請時編號重複
      rmaNumber: `RMA${Date.now().toString().slice(-7)}${Math.floor(Math.random() * 90 + 10)}`,
      orderId: order.id,
      userId: user.id,
      type,
      reason,
      description: description || null,
      items: { create: items },
    },
  });
  revalidatePath("/", "layout");
  redirect(`/account/returns/${rma.rmaNumber}?created=1`);
}

export async function cancelReturnAction(formData: FormData) {
  const user = await requireUser("/account/returns");
  const rmaNumber = String(formData.get("rmaNumber"));
  await prisma.returnRequest.updateMany({ where: { rmaNumber, userId: user.id, status: "REQUESTED" }, data: { status: "CANCELLED" } });
  revalidatePath("/", "layout");
}
