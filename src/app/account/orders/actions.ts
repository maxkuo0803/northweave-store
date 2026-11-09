"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { createReturn, type ReturnItemInput } from "@/lib/returns";
import { cancelOrder, cancelReturn } from "@/lib/shop";

export async function cancelOrderAction(formData: FormData) {
  const orderNumber = String(formData.get("orderNumber"));
  const user = await requireUser(`/account/orders/${orderNumber}`);
  await cancelOrder(user.id, orderNumber);
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

  // 表單欄位：qty_<orderItemId>、exchange_<orderItemId>
  const items: ReturnItemInput[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("qty_")) continue;
    const orderItemId = key.slice(4);
    const qty = Number(value);
    if (!Number.isInteger(qty)) return { error: "數量格式錯誤" };
    if (qty) items.push({ orderItemId, quantity: qty, exchangeVariantId: String(formData.get(`exchange_${orderItemId}`) ?? "") || null });
  }
  // 規則檢查（鑑賞期、可退數量、換貨庫存）都在 createReturn 裡，AI 客服也共用
  const rma = await createReturn(user.id, { orderNumber, type, reason, description, items });
  if (!rma.ok) return { error: rma.error };
  revalidatePath("/", "layout");
  redirect(`/account/returns/${rma.rmaNumber}?created=1`);
}

export async function cancelReturnAction(formData: FormData) {
  const user = await requireUser("/account/returns");
  await cancelReturn(user.id, String(formData.get("rmaNumber")));
  revalidatePath("/", "layout");
}
