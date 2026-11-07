"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import type { OrderStatus } from "@/generated/prisma/enums";

// 後台每個 action 都要先檢查是不是管理員 —— 不能只靠「頁面上看不到按鈕」來保護

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  PAID: "PROCESSING",
  PROCESSING: "SHIPPED",
  SHIPPED: "DELIVERED",
  DELIVERED: "COMPLETED",
};

export async function advanceOrderAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const order = await prisma.order.findUniqueOrThrow({ where: { id } });
  const next = NEXT_STATUS[order.status];
  if (!next) return;
  const now = new Date();
  const note = String(formData.get("note") ?? "").trim() || null;
  const tracking = String(formData.get("trackingNumber") ?? "").trim();
  if (next === "SHIPPED" && !tracking) return;

  await prisma.order.update({
    where: { id },
    data: {
      status: next,
      ...(next === "SHIPPED" && { shippedAt: now, trackingNumber: tracking }),
      ...(next === "DELIVERED" && { deliveredAt: now, ...(order.paymentMethod === "COD" && { paymentStatus: "PAID", paidAt: now }) }),
      history: {
        create: {
          status: next,
          note: note ?? (next === "SHIPPED" ? `已交由${order.carrier ?? "物流"}配送` : next === "DELIVERED" && order.paymentMethod === "COD" ? "商品已送達，貨到付款已收款" : next === "COMPLETED" ? "鑑賞期結束，訂單完成" : null),
        },
      },
    },
  });
  revalidatePath("/", "layout");
}

export async function adminCancelOrderAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const note = String(formData.get("note") ?? "").trim() || "店家取消訂單";
  const order = await prisma.order.findUniqueOrThrow({ where: { id }, include: { items: true } });
  if (!["PENDING_PAYMENT", "PAID", "PROCESSING"].includes(order.status)) return;
  await prisma.$transaction(async (tx) => {
    for (const it of order.items) {
      if (it.variantId) await tx.productVariant.update({ where: { id: it.variantId }, data: { stock: { increment: it.quantity } } });
    }
    await tx.order.update({
      where: { id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        paymentStatus: order.paymentStatus === "PAID" ? "REFUNDED" : order.paymentStatus,
        history: { create: { status: "CANCELLED", note } },
      },
    });
  });
  revalidatePath("/", "layout");
}

// ───────────── 退換貨 ─────────────

export async function reviewReturnAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const decision = formData.get("decision");
  const adminNote = String(formData.get("adminNote") ?? "").trim() || null;
  if (decision === "approve") {
    await prisma.returnRequest.updateMany({ where: { id, status: "REQUESTED" }, data: { status: "APPROVED", adminNote } });
  } else if (decision === "reject") {
    await prisma.returnRequest.updateMany({ where: { id, status: "REQUESTED" }, data: { status: "REJECTED", adminNote: adminNote ?? "不符合退換貨條件" } });
  }
  revalidatePath("/", "layout");
}

export async function receiveReturnAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const r = await prisma.returnRequest.findUniqueOrThrow({ where: { id }, include: { items: { include: { orderItem: true } } } });
  if (r.status !== "APPROVED") return;
  await prisma.$transaction(async (tx) => {
    // 收到退回商品 → 檢查無誤後放回庫存
    for (const it of r.items) {
      if (it.orderItem.variantId) await tx.productVariant.update({ where: { id: it.orderItem.variantId }, data: { stock: { increment: it.quantity } } });
    }
    await tx.returnRequest.update({ where: { id }, data: { status: "RECEIVED" } });
  });
  revalidatePath("/", "layout");
}

export async function completeReturnAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const r = await prisma.returnRequest.findUniqueOrThrow({ where: { id }, include: { order: true, items: { include: { orderItem: true } } } });
  if (r.status !== "RECEIVED") return;

  if (r.type === "RETURN") {
    const amount = z.coerce.number().int().min(0).max(r.order.total).catch(0).parse(formData.get("refundAmount"));
    const refundedBefore = (await prisma.returnRequest.aggregate({ where: { orderId: r.orderId, status: "REFUNDED" }, _sum: { refundAmount: true } }))._sum.refundAmount ?? 0;
    await prisma.$transaction([
      prisma.returnRequest.update({ where: { id }, data: { status: "REFUNDED", refundAmount: amount } }),
      prisma.order.update({ where: { id: r.orderId }, data: { paymentStatus: refundedBefore + amount >= r.order.total ? "REFUNDED" : "PARTIALLY_REFUNDED" } }),
    ]);
  } else {
    // 換貨：寄出新商品，扣新 SKU 的庫存
    await prisma.$transaction(async (tx) => {
      for (const it of r.items) {
        if (!it.exchangeVariantId) continue;
        const ok = await tx.productVariant.updateMany({ where: { id: it.exchangeVariantId, stock: { gte: it.quantity } }, data: { stock: { decrement: it.quantity } } });
        if (ok.count === 0) throw new Error("換貨商品庫存不足");
      }
      await tx.returnRequest.update({ where: { id }, data: { status: "EXCHANGED" } });
    });
  }
  revalidatePath("/", "layout");
}

// ───────────── 商品 ─────────────

const productSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1),
  price: z.coerce.number().int().min(1),
  salePrice: z.union([z.literal(""), z.coerce.number().int().min(1)]),
  status: z.enum(["ACTIVE", "DRAFT", "ARCHIVED"]),
  description: z.string().trim().min(1),
});

export async function updateProductAction(_: unknown, formData: FormData) {
  await requireAdmin();
  const parsed = productSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "欄位格式錯誤：" + parsed.error.issues[0].path.join(".") };
  const { id, salePrice, ...rest } = parsed.data;
  if (salePrice !== "" && salePrice >= rest.price) return { error: "特價必須低於原價" };
  await prisma.product.update({ where: { id }, data: { ...rest, salePrice: salePrice === "" ? null : salePrice, isFeatured: formData.get("isFeatured") === "on" } });

  // 庫存欄位：stock_<variantId>
  const updates = [...formData.entries()].filter(([k]) => k.startsWith("stock_"));
  await prisma.$transaction(
    updates.map(([k, v]) => prisma.productVariant.update({ where: { id: k.slice(6), productId: id }, data: { stock: Math.max(0, Number(v) || 0) } })),
  );
  revalidatePath("/", "layout");
  return { ok: "已儲存" };
}
