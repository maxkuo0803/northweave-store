"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { getCart, quote, validateCoupon } from "@/lib/pricing";
import { SHIPPING } from "@/lib/store-config";
import { TOO_MANY, rateLimit } from "@/lib/rate-limit";
import type { OrderStatus } from "@/generated/prisma/enums";

export async function checkCouponAction(code: string, subtotal: number) {
  await requireUser("/checkout");
  const r = await validateCoupon(code, subtotal);
  return r.error ? { error: r.error } : { discount: r.discount, code: r.coupon!.code, description: r.coupon!.description };
}

export type CheckoutState = { error?: string } | undefined;

const schema = z.object({
  shippingMethod: z.enum(["HOME", "CVS"]),
  paymentMethod: z.enum(["CREDIT_CARD", "LINE_PAY", "ATM", "COD"]),
  addressId: z.string().optional(),
  cvsStore: z.string().max(40).optional(),
  couponCode: z.string().max(40).optional(),
  note: z.string().max(200).optional(),
});

const newAddressSchema = z.object({
  new_recipientName: z.string().trim().min(1, "請輸入收件人").max(40),
  new_phone: z.string().trim().regex(/^09\d{8}$/, "手機號碼格式為 09 開頭共 10 碼"),
  new_zipCode: z.string().trim().regex(/^\d{3,6}$/, "請輸入郵遞區號"),
  new_city: z.string().min(1, "請選擇縣市").max(10),
  new_district: z.string().trim().min(1, "請輸入鄉鎮市區").max(20),
  new_line: z.string().trim().min(3, "請輸入詳細地址").max(120),
});

function newOrderNumber() {
  const d = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" }).slice(2).replace(/-/g, "");
  return `NW${d}${Math.floor(100000 + Math.random() * 900000)}`;
}

class StockError extends Error {}

export async function placeOrderAction(_: CheckoutState, formData: FormData): Promise<CheckoutState> {
  const user = await requireUser("/checkout");
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "結帳資料不完整" };
  const f = parsed.data;
  // 防止洗訂單（會把展示商品的庫存扣光）：每個帳號 1 小時最多 10 筆
  if (!(await rateLimit(`order:${user.id}`, 10, 3600))) return { error: TOO_MANY };

  // 收件資訊
  let recipient: { name: string; phone: string; address: string };
  if (f.shippingMethod === "CVS") {
    if (!f.cvsStore) return { error: "請選擇取貨門市" };
    recipient = { name: String(formData.get("cvsName") ?? user.name).trim().slice(0, 40), phone: String(formData.get("cvsPhone") ?? ""), address: `7-ELEVEN ${f.cvsStore}` };
    if (!/^09\d{8}$/.test(recipient.phone)) return { error: "請輸入取件人手機（09 開頭共 10 碼）" };
  } else if (f.addressId && f.addressId !== "new") {
    const a = await prisma.address.findFirst({ where: { id: f.addressId, userId: user.id } });
    if (!a) return { error: "找不到收件地址" };
    recipient = { name: a.recipientName, phone: a.phone, address: `${a.zipCode} ${a.city}${a.district}${a.line}` };
  } else {
    const na = newAddressSchema.safeParse(Object.fromEntries(formData));
    if (!na.success) return { error: na.error.issues[0].message };
    const a = na.data;
    recipient = { name: a.new_recipientName, phone: a.new_phone, address: `${a.new_zipCode} ${a.new_city}${a.new_district}${a.new_line}` };
    if (formData.get("saveAddress") === "on" && (await prisma.address.count({ where: { userId: user.id } })) < 10) {
      const isFirst = (await prisma.address.count({ where: { userId: user.id } })) === 0;
      await prisma.address.create({ data: { userId: user.id, recipientName: a.new_recipientName, phone: a.new_phone, zipCode: a.new_zipCode, city: a.new_city, district: a.new_district, line: a.new_line, isDefault: isFirst } });
    }
  }

  const lines = await getCart(user.id);
  if (lines.length === 0) return { error: "購物車是空的" };
  const q = await quote(lines, f.shippingMethod, f.couponCode || undefined);
  if (f.couponCode && q.couponError) return { error: `優惠碼無法使用：${q.couponError}` };

  // 模擬金流：信用卡 / LINE Pay 直接視為付款成功；ATM 等待轉帳；貨到付款直接進備貨
  const now = new Date();
  const instantPaid = f.paymentMethod === "CREDIT_CARD" || f.paymentMethod === "LINE_PAY";
  const status: OrderStatus = instantPaid ? "PAID" : f.paymentMethod === "COD" ? "PROCESSING" : "PENDING_PAYMENT";
  const history: { status: OrderStatus; note: string; createdAt: Date }[] = [{ status: "PENDING_PAYMENT", note: "訂單成立", createdAt: now }];
  if (instantPaid) history.push({ status: "PAID", note: "付款成功（模擬）", createdAt: new Date(now.getTime() + 1000) });
  if (f.paymentMethod === "COD") history.push({ status: "PROCESSING", note: "貨到付款訂單已確認，開始備貨", createdAt: new Date(now.getTime() + 1000) });

  let orderNumber: string;
  try {
    // 交易（transaction）：扣庫存、建立訂單、清空購物車要嘛全部成功，要嘛全部失敗
    orderNumber = await prisma.$transaction(async (tx) => {
      for (const l of lines) {
        // 條件式扣庫存：只有庫存足夠時才扣，避免兩個人同時買最後一件造成超賣
        const r = await tx.productVariant.updateMany({ where: { id: l.variantId, stock: { gte: l.quantity } }, data: { stock: { decrement: l.quantity } } });
        if (r.count === 0) throw new StockError(`${l.productName}（${l.color} / ${l.size}）庫存不足`);
      }
      if (q.couponCode) await tx.coupon.update({ where: { code: q.couponCode }, data: { usedCount: { increment: 1 } } });
      const order = await tx.order.create({
        data: {
          orderNumber: newOrderNumber(),
          userId: user.id,
          status,
          paymentMethod: f.paymentMethod,
          paymentStatus: instantPaid ? "PAID" : "UNPAID",
          paidAt: instantPaid ? now : null,
          shippingMethod: f.shippingMethod,
          recipientName: recipient.name,
          recipientPhone: recipient.phone,
          shippingAddress: recipient.address,
          subtotal: q.subtotal,
          discount: q.discount,
          shippingFee: q.shippingFee,
          total: q.total,
          couponCode: q.couponCode,
          note: f.note || null,
          carrier: SHIPPING.carriers[f.shippingMethod],
          items: {
            create: lines.map((l) => ({ variantId: l.variantId, productName: l.productName, sku: l.sku, color: l.color, size: l.size, unitPrice: l.unitPrice, quantity: l.quantity, imageUrl: l.imageUrl })),
          },
          history: { create: history },
        },
      });
      await tx.cartItem.deleteMany({ where: { userId: user.id } });
      return order.orderNumber;
    });
  } catch (e) {
    if (e instanceof StockError) return { error: `${e.message}，請回購物車調整` };
    throw e;
  }

  revalidatePath("/", "layout");
  redirect(`/account/orders/${orderNumber}?placed=1`);
}
