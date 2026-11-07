import "server-only";
import type { ShippingMethod } from "@/generated/prisma/enums";
import { prisma } from "./prisma";
import { garmentImageUrl, shippingFeeFor } from "./store-config";

// 購物車、結帳頁、下單共用同一套計價邏輯 —— 金額永遠在伺服器算，不相信前端傳來的數字
export async function getCart(userId: string) {
  const items = await prisma.cartItem.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    include: { variant: { include: { product: true } } },
  });
  return items.map((it) => {
    const p = it.variant.product;
    const unitPrice = p.salePrice ?? p.price;
    return {
      id: it.id,
      quantity: it.quantity,
      variantId: it.variantId,
      productId: p.id,
      productName: p.name,
      slug: p.slug,
      sku: it.variant.sku,
      color: it.variant.color,
      size: it.variant.size,
      stock: it.variant.stock,
      available: p.status === "ACTIVE" && it.variant.stock >= it.quantity,
      unitPrice,
      originalPrice: p.price,
      lineTotal: unitPrice * it.quantity,
      imageUrl: garmentImageUrl(p.garmentType, it.variant.colorHex),
    };
  });
}
export type CartLine = Awaited<ReturnType<typeof getCart>>[number];

export async function validateCoupon(code: string | undefined, subtotal: number) {
  if (!code) return { discount: 0 };
  const coupon = await prisma.coupon.findUnique({ where: { code: code.trim().toUpperCase() } });
  const now = new Date();
  if (!coupon || !coupon.isActive) return { discount: 0, error: "優惠碼不存在" };
  if (now < coupon.startsAt || now > coupon.endsAt) return { discount: 0, error: "優惠碼不在使用期間內" };
  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) return { discount: 0, error: "優惠碼已被使用完畢" };
  if (subtotal < coupon.minSpend) return { discount: 0, error: `需滿 NT$${coupon.minSpend.toLocaleString()} 才能使用` };
  const discount = coupon.type === "PERCENT" ? Math.round((subtotal * coupon.value) / 100) : Math.min(coupon.value, subtotal);
  return { discount, coupon };
}

export async function quote(lines: CartLine[], shippingMethod: ShippingMethod, couponCode?: string) {
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const c = await validateCoupon(couponCode, subtotal);
  const shippingFee = lines.length ? shippingFeeFor(shippingMethod, subtotal - c.discount) : 0;
  return {
    subtotal,
    discount: c.discount,
    couponCode: c.coupon?.code,
    couponError: c.error,
    shippingFee,
    total: subtotal - c.discount + shippingFee,
  };
}
