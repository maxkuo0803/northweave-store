import "server-only";
import { prisma } from "./prisma";
import { getCart, quote } from "./pricing";
import { CANCELLABLE } from "./orders";
import { rateLimit, TOO_MANY } from "./rate-limit";
import { SHIPPING, isDemoEmail } from "./store-config";
import type { OrderStatus, PaymentMethod, ShippingMethod } from "@/generated/prisma/enums";

// 顧客在網站上能做的事（購物車、收藏、下單、取消、地址、個人資料）集中在這裡。
// 網站的表單（Server Action）和 AI 客服小織都呼叫同一套函式：
// 規則只寫一次，AI 能做的事和顧客自己點按鈕完全一樣，也一樣受到庫存、金額、權限的檢查。
//
// 每個函式的第一個參數都是「已驗證的 userId」，查詢條件一律帶 userId，不能動到別人的資料。

export type Result<T = object> = ({ ok: true; message: string } & T) | { ok: false; error: string };
const fail = (error: string) => ({ ok: false as const, error });

// ── 購物車 ──
export async function addToCart(userId: string, variantId: string, quantity: number): Promise<Result> {
  const qty = Math.max(1, Math.min(10, Math.floor(quantity) || 1));
  const variant = await prisma.productVariant.findUnique({ where: { id: variantId }, include: { product: true } });
  if (!variant || variant.product.status !== "ACTIVE") return fail("商品已下架");
  const existing = await prisma.cartItem.findUnique({ where: { userId_variantId: { userId, variantId } } });
  const nextQty = (existing?.quantity ?? 0) + qty;
  if (nextQty > variant.stock) {
    return fail(variant.stock === 0 ? "這個尺寸已售完" : `庫存只剩 ${variant.stock} 件${existing ? `，購物車已有 ${existing.quantity} 件` : ""}`);
  }
  await prisma.cartItem.upsert({
    where: { userId_variantId: { userId, variantId } },
    create: { userId, variantId, quantity: qty },
    update: { quantity: nextQty },
  });
  return { ok: true, message: `已加入購物車：${variant.product.name} ${variant.color} / ${variant.size} × ${qty}` };
}

export async function setCartQuantity(userId: string, cartItemId: string, quantity: number): Promise<Result> {
  const item = await prisma.cartItem.findFirst({ where: { id: cartItemId, userId }, include: { variant: { include: { product: true } } } });
  if (!item) return fail("購物車裡沒有這個商品");
  if (quantity <= 0) {
    await prisma.cartItem.delete({ where: { id: item.id } });
    return { ok: true, message: `已從購物車移除 ${item.variant.product.name}` };
  }
  const q = Math.min(Math.floor(quantity), item.variant.stock, 10);
  if (q <= 0) return fail("這個尺寸已售完");
  await prisma.cartItem.update({ where: { id: item.id }, data: { quantity: q } });
  return { ok: true, message: `已把 ${item.variant.product.name} 改成 ${q} 件${q < quantity ? `（庫存只剩 ${item.variant.stock} 件）` : ""}` };
}

export async function removeCartItem(userId: string, cartItemId: string): Promise<Result> {
  const r = await prisma.cartItem.deleteMany({ where: { id: cartItemId, userId } });
  return r.count ? { ok: true, message: "已從購物車移除" } : fail("購物車裡沒有這個商品");
}

// ── 收藏 ──
export async function setWishlist(userId: string, productId: string, wanted: boolean): Promise<Result> {
  const product = await prisma.product.findFirst({ where: { id: productId, status: "ACTIVE" }, select: { name: true } });
  if (!product) return fail("找不到這個商品");
  const key = { userId_productId: { userId, productId } };
  if (wanted) await prisma.wishlistItem.upsert({ where: key, create: { userId, productId }, update: {} });
  else await prisma.wishlistItem.deleteMany({ where: { userId, productId } });
  return { ok: true, message: wanted ? `已收藏 ${product.name}` : `已取消收藏 ${product.name}` };
}

// ── 下單 ──
export type Recipient = { name: string; phone: string; address: string };

function newOrderNumber() {
  const d = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" }).slice(2).replace(/-/g, "");
  return `NW${d}${Math.floor(100000 + Math.random() * 900000)}`;
}

class StockError extends Error {}

export async function placeOrder(
  userId: string,
  input: { shippingMethod: ShippingMethod; paymentMethod: PaymentMethod; recipient: Recipient; couponCode?: string | null; note?: string | null },
): Promise<Result<{ orderNumber: string; total: number }>> {
  // 防止洗訂單（會把展示商品的庫存扣光）：每個帳號 1 小時最多 10 筆
  if (!(await rateLimit(`order:${userId}`, 10, 3600))) return fail(TOO_MANY);
  if (!/^09\d{8}$/.test(input.recipient.phone)) return fail("收件人手機格式為 09 開頭共 10 碼");

  const lines = await getCart(userId);
  if (lines.length === 0) return fail("購物車是空的");
  const q = await quote(lines, input.shippingMethod, input.couponCode || undefined);
  if (input.couponCode && q.couponError) return fail(`優惠碼無法使用：${q.couponError}`);

  // 模擬金流：信用卡 / LINE Pay 直接視為付款成功；ATM 等待轉帳；貨到付款直接進備貨
  const now = new Date();
  const instantPaid = input.paymentMethod === "CREDIT_CARD" || input.paymentMethod === "LINE_PAY";
  const status: OrderStatus = instantPaid ? "PAID" : input.paymentMethod === "COD" ? "PROCESSING" : "PENDING_PAYMENT";
  const history: { status: OrderStatus; note: string; createdAt: Date }[] = [{ status: "PENDING_PAYMENT", note: "訂單成立", createdAt: now }];
  if (instantPaid) history.push({ status: "PAID", note: "付款成功（模擬）", createdAt: new Date(now.getTime() + 1000) });
  if (input.paymentMethod === "COD") history.push({ status: "PROCESSING", note: "貨到付款訂單已確認，開始備貨", createdAt: new Date(now.getTime() + 1000) });

  try {
    // 交易（transaction）：扣庫存、建立訂單、清空購物車要嘛全部成功，要嘛全部失敗
    const order = await prisma.$transaction(async (tx) => {
      for (const l of lines) {
        // 條件式扣庫存：只有庫存足夠時才扣，避免兩個人同時買最後一件造成超賣
        const r = await tx.productVariant.updateMany({ where: { id: l.variantId, stock: { gte: l.quantity } }, data: { stock: { decrement: l.quantity } } });
        if (r.count === 0) throw new StockError(`${l.productName}（${l.color} / ${l.size}）庫存不足`);
      }
      if (q.couponCode) await tx.coupon.update({ where: { code: q.couponCode }, data: { usedCount: { increment: 1 } } });
      const o = await tx.order.create({
        data: {
          orderNumber: newOrderNumber(),
          userId,
          status,
          paymentMethod: input.paymentMethod,
          paymentStatus: instantPaid ? "PAID" : "UNPAID",
          paidAt: instantPaid ? now : null,
          shippingMethod: input.shippingMethod,
          recipientName: input.recipient.name,
          recipientPhone: input.recipient.phone,
          shippingAddress: input.recipient.address,
          subtotal: q.subtotal,
          discount: q.discount,
          shippingFee: q.shippingFee,
          total: q.total,
          couponCode: q.couponCode,
          note: input.note || null,
          carrier: SHIPPING.carriers[input.shippingMethod],
          items: {
            create: lines.map((l) => ({ variantId: l.variantId, productName: l.productName, sku: l.sku, color: l.color, size: l.size, unitPrice: l.unitPrice, quantity: l.quantity, imageUrl: l.imageUrl })),
          },
          history: { create: history },
        },
      });
      await tx.cartItem.deleteMany({ where: { userId } });
      return o;
    });
    return { ok: true, message: `訂單 ${order.orderNumber} 已成立`, orderNumber: order.orderNumber, total: order.total };
  } catch (e) {
    if (e instanceof StockError) return fail(`${e.message}，請調整購物車`);
    throw e;
  }
}

// ── 取消訂單（待付款 / 已付款才能取消，自動歸還庫存） ──
export async function cancelOrder(userId: string, orderNumber: string): Promise<Result> {
  const order = await prisma.order.findFirst({ where: { orderNumber, userId }, include: { items: true } });
  if (!order) return fail("找不到訂單");
  if (!CANCELLABLE.includes(order.status)) return fail("訂單已進入備貨或出貨，不能取消；收到商品後可以申請退貨");
  await prisma.$transaction(async (tx) => {
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
  return { ok: true, message: `訂單 ${orderNumber} 已取消${order.paymentStatus === "PAID" ? "，款項將於 3–5 個工作天退回" : ""}` };
}

// ── 取消退換貨申請（審核中才能取消） ──
export async function cancelReturn(userId: string, rmaNumber: string): Promise<Result> {
  const r = await prisma.returnRequest.updateMany({ where: { rmaNumber, userId, status: "REQUESTED" }, data: { status: "CANCELLED" } });
  return r.count ? { ok: true, message: `退換貨申請 ${rmaNumber} 已取消` } : fail("找不到審核中的這筆申請（已核准或已處理的不能取消）");
}

// ── 收件地址 ──
export type AddressInput = { recipientName: string; phone: string; zipCode: string; city: string; district: string; line: string };

export async function addAddress(userId: string, a: AddressInput, makeDefault = false): Promise<Result<{ addressId: string }>> {
  const count = await prisma.address.count({ where: { userId } });
  // 一個帳號最多 10 筆地址，避免被灌爆
  if (count >= 10) return fail("最多只能存 10 筆地址");
  const isDefault = makeDefault || count === 0;
  const created = await prisma.$transaction(async (tx) => {
    if (isDefault) await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
    return tx.address.create({ data: { ...a, userId, isDefault } });
  });
  return { ok: true, message: "已新增地址", addressId: created.id };
}

export async function deleteAddress(userId: string, addressId: string): Promise<Result> {
  // where 同時帶 userId：確保只能刪自己的地址
  const r = await prisma.address.deleteMany({ where: { id: addressId, userId } });
  return r.count ? { ok: true, message: "已刪除地址" } : fail("找不到這筆地址");
}

export async function setDefaultAddress(userId: string, addressId: string): Promise<Result> {
  const exists = await prisma.address.findFirst({ where: { id: addressId, userId } });
  if (!exists) return fail("找不到這筆地址");
  await prisma.$transaction([
    prisma.address.updateMany({ where: { userId }, data: { isDefault: false } }),
    prisma.address.update({ where: { id: addressId }, data: { isDefault: true } }),
  ]);
  return { ok: true, message: "已設為預設地址" };
}

// ── 個人資料（姓名、手機）；密碼和 Email 不開放 AI 修改 ──
export async function updateProfile(userId: string, data: { name?: string; phone?: string | null }): Promise<Result> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user) return fail("找不到會員");
  if (isDemoEmail(user.email)) return fail("這是公開的展示帳號，不能修改個人資料");
  await prisma.user.update({ where: { id: userId }, data });
  return { ok: true, message: "已更新個人資料" };
}
