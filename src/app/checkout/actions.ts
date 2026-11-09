"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { validateCoupon } from "@/lib/pricing";
import { placeOrder } from "@/lib/shop";

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

export async function placeOrderAction(_: CheckoutState, formData: FormData): Promise<CheckoutState> {
  const user = await requireUser("/checkout");
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "結帳資料不完整" };
  const f = parsed.data;

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

  // 計價、扣庫存、建立訂單在 lib/shop.ts（AI 客服代客下單也用同一套）
  const r = await placeOrder(user.id, { shippingMethod: f.shippingMethod, paymentMethod: f.paymentMethod, recipient, couponCode: f.couponCode || null, note: f.note || null });
  if (!r.ok) return { error: r.error };
  revalidatePath("/", "layout");
  redirect(`/account/orders/${r.orderNumber}?placed=1`);
}
