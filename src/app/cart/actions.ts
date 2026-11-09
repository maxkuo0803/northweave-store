"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession, requireUser } from "@/lib/session";
import { safePath } from "@/lib/utils";
import { addToCart, removeCartItem, setCartQuantity, setWishlist } from "@/lib/shop";

export type CartState = { ok?: string; error?: string } | undefined;

export async function addToCartAction(_: CartState, formData: FormData): Promise<CartState> {
  const session = await getSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(safePath(formData.get("returnTo"), "/"))}`);

  const variantId = String(formData.get("variantId") ?? "");
  if (!variantId) return { error: "請先選擇顏色與尺寸" };
  // 規則（庫存、上下架、數量上限）在 lib/shop.ts，AI 客服也用同一套
  const r = await addToCart(session.user.id, variantId, Number(formData.get("quantity")) || 1);
  if (!r.ok) return { error: r.error };
  revalidatePath("/", "layout");
  return { ok: r.message };
}

export async function updateCartItemAction(formData: FormData) {
  const user = await requireUser("/cart");
  await setCartQuantity(user.id, String(formData.get("id")), Number(formData.get("quantity")) || 1);
  revalidatePath("/", "layout");
}

export async function removeCartItemAction(formData: FormData) {
  const user = await requireUser("/cart");
  await removeCartItem(user.id, String(formData.get("id")));
  revalidatePath("/", "layout");
}

export async function toggleWishlistAction(formData: FormData) {
  const productId = String(formData.get("productId"));
  const user = await requireUser(safePath(formData.get("returnTo"), "/"));
  const existing = await prisma.wishlistItem.findUnique({ where: { userId_productId: { userId: user.id, productId } } });
  await setWishlist(user.id, productId, !existing);
  revalidatePath("/", "layout");
}
