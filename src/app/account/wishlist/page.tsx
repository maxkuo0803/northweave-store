import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { productCardSelect } from "@/lib/catalog";
import { ProductCard } from "@/components/ProductCard";
import { toggleWishlistAction } from "@/app/cart/actions";

export const metadata: Metadata = { title: "我的收藏" };

export default async function WishlistPage() {
  const user = await requireUser("/account/wishlist");
  const items = await prisma.wishlistItem.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: { product: { select: { ...productCardSelect, status: true } } },
  });

  return (
    <div>
      <h1 className="display text-3xl md:text-4xl">我的收藏</h1>
      {items.length === 0 && <p className="mt-6 text-muted">還沒有收藏的商品。</p>}
      <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-8 lg:grid-cols-3">
        {items.map((w) => (
          <div key={w.id}>
            {w.product.status === "ACTIVE" ? <ProductCard product={w.product} /> : <p className="card p-4 text-sm text-muted">{w.product.name}（已下架）</p>}
            <form action={toggleWishlistAction} className="mt-2">
              <input type="hidden" name="productId" value={w.productId} />
              <input type="hidden" name="returnTo" value="/account/wishlist" />
              <button className="text-xs text-muted underline">移除收藏</button>
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}
