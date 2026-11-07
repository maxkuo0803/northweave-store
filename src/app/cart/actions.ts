"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession, requireUser } from "@/lib/session";
import { safePath } from "@/lib/utils";

export type CartState = { ok?: string; error?: string } | undefined;

export async function addToCartAction(_: CartState, formData: FormData): Promise<CartState> {
  const session = await getSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(safePath(formData.get("returnTo"), "/"))}`);

  const variantId = String(formData.get("variantId") ?? "");
  const quantity = Math.max(1, Math.min(10, Number(formData.get("quantity")) || 1));
  if (!variantId) return { error: "請先選擇顏色與尺寸" };

  const variant = await prisma.productVariant.findUnique({ where: { id: variantId }, include: { product: true } });
  if (!variant || variant.product.status !== "ACTIVE") return { error: "商品已下架" };

  const existing = await prisma.cartItem.findUnique({ where: { userId_variantId: { userId: session.user.id, variantId } } });
  const nextQty = (existing?.quantity ?? 0) + quantity;
  if (nextQty > variant.stock) {
    return { error: variant.stock === 0 ? "這個尺寸已售完" : `庫存只剩 ${variant.stock} 件${existing ? `，購物車已有 ${existing.quantity} 件` : ""}` };
  }

  await prisma.cartItem.upsert({
    where: { userId_variantId: { userId: session.user.id, variantId } },
    create: { userId: session.user.id, variantId, quantity },
    update: { quantity: nextQty },
  });
  revalidatePath("/", "layout");
  return { ok: `已加入購物車：${variant.color} / ${variant.size}` };
}

export async function updateCartItemAction(formData: FormData) {
  const user = await requireUser("/cart");
  const id = String(formData.get("id"));
  const item = await prisma.cartItem.findFirst({ where: { id, userId: user.id }, include: { variant: true } });
  if (!item) return;
  const quantity = Math.min(Number(formData.get("quantity")) || 1, item.variant.stock, 10);
  if (quantity <= 0) await prisma.cartItem.delete({ where: { id } });
  else await prisma.cartItem.update({ where: { id }, data: { quantity } });
  revalidatePath("/", "layout");
}

export async function removeCartItemAction(formData: FormData) {
  const user = await requireUser("/cart");
  await prisma.cartItem.deleteMany({ where: { id: String(formData.get("id")), userId: user.id } });
  revalidatePath("/", "layout");
}

export async function toggleWishlistAction(formData: FormData) {
  const productId = String(formData.get("productId"));
  const user = await requireUser(safePath(formData.get("returnTo"), "/"));
  const key = { userId_productId: { userId: user.id, productId } };
  const existing = await prisma.wishlistItem.findUnique({ where: key });
  if (existing) await prisma.wishlistItem.delete({ where: key });
  else await prisma.wishlistItem.create({ data: { userId: user.id, productId } });
  revalidatePath("/", "layout");
}
