import "server-only";
import { prisma } from "./prisma";
import { RETURN_WINDOW_DAYS } from "./store-config";
import type { OrderStatus, ReturnStatus } from "@/generated/prisma/enums";

export const CANCELLABLE: OrderStatus[] = ["PENDING_PAYMENT", "PAID"];
// 這些狀態的退換貨申請「還算數」，會佔用可退數量
const ACTIVE_RETURN: ReturnStatus[] = ["REQUESTED", "APPROVED", "RECEIVED", "REFUNDED", "EXCHANGED"];

export async function getOrderForUser(orderNumber: string, userId: string) {
  return prisma.order.findFirst({
    where: { orderNumber, userId },
    include: {
      items: { include: { returnItems: { include: { returnRequest: true } }, variant: { select: { productId: true, product: { select: { slug: true } } } } } },
      history: { orderBy: { createdAt: "asc" } },
      returnRequests: { orderBy: { createdAt: "desc" } },
    },
  });
}
export type OrderDetail = NonNullable<Awaited<ReturnType<typeof getOrderForUser>>>;

export function returnDeadline(order: { deliveredAt: Date | null }) {
  if (!order.deliveredAt) return null;
  // 鑑賞期從收到商品「隔天」起算 7 天
  const d = new Date(order.deliveredAt);
  d.setHours(23, 59, 59, 999);
  d.setDate(d.getDate() + RETURN_WINDOW_DAYS);
  return d;
}

// 每個商品還可以退幾件
export function returnableQuantities(order: OrderDetail) {
  return Object.fromEntries(
    order.items.map((it) => {
      const used = it.returnItems.filter((ri) => ACTIVE_RETURN.includes(ri.returnRequest.status)).reduce((s, ri) => s + ri.quantity, 0);
      return [it.id, Math.max(0, it.quantity - used)];
    }),
  ) as Record<string, number>;
}

export function returnEligibility(order: OrderDetail, now = new Date()): { ok: true; deadline: Date } | { ok: false; reason: string } {
  if (order.status !== "DELIVERED") {
    if (order.status === "COMPLETED") return { ok: false, reason: `已超過 ${RETURN_WINDOW_DAYS} 天鑑賞期` };
    if (order.status === "CANCELLED") return { ok: false, reason: "訂單已取消" };
    return { ok: false, reason: "商品送達後才能申請退換貨" };
  }
  const deadline = returnDeadline(order)!;
  if (now > deadline) return { ok: false, reason: `已超過 ${RETURN_WINDOW_DAYS} 天鑑賞期` };
  if (Object.values(returnableQuantities(order)).every((q) => q === 0)) return { ok: false, reason: "所有商品都已申請過退換貨" };
  return { ok: true, deadline };
}

// 模擬 ATM 虛擬帳號（正式環境由金流商產生）
export function virtualAccount(orderNumber: string) {
  const digits = orderNumber.replace(/\D/g, "");
  return { bank: "822 中國信託", account: `9103${digits.slice(-10).padStart(10, "0")}` };
}
