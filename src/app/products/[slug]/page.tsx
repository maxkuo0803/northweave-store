import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProductBySlug } from "@/lib/catalog";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Price } from "@/components/Price";
import { RETURN_WINDOW_DAYS, SHIPPING, formatDate } from "@/lib/store-config";
import { toggleWishlistAction } from "@/app/cart/actions";
import { VariantPicker } from "./VariantPicker";

export async function generateMetadata({ params }: PageProps<"/products/[slug]">): Promise<Metadata> {
  const product = await getProductBySlug((await params).slug);
  return { title: product?.name ?? "找不到商品", description: product?.description };
}

const SIZE_CHART: Record<string, string[][]> = {
  top: [["尺寸", "胸寬", "衣長", "肩寬"], ["XS", "48", "62", "42"], ["S", "51", "65", "45"], ["M", "54", "68", "47"], ["L", "57", "71", "49"], ["XL", "60", "74", "51"]],
  bottom: [["尺寸", "腰圍", "臀圍", "褲長"], ["XS / 24-25", "62", "88", "96"], ["S / 26-28", "68", "92", "98"], ["M / 29-30", "74", "96", "100"], ["L / 32-34", "80", "100", "102"], ["XL / 36", "86", "104", "104"]],
};
const BOTTOMS = ["pants", "shorts", "skirt"];

export default async function ProductPage({ params }: PageProps<"/products/[slug]">) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const session = await getSession();
  const wished = session ? !!(await prisma.wishlistItem.findUnique({ where: { userId_productId: { userId: session.user.id, productId: product.id } } })) : false;
  const n = product.reviews.length;
  const avg = n ? product.reviews.reduce((s, r) => s + r.rating, 0) / n : 0;
  const fit = { SMALL: 0, TRUE: 0, LARGE: 0 } as Record<string, number>;
  product.reviews.forEach((r) => r.fit && fit[r.fit]++);
  const chart = SIZE_CHART[BOTTOMS.includes(product.garmentType) ? "bottom" : "top"];
  const isAccessory = product.variants.every((v) => v.size === "F");
  const path = `/products/${slug}`;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <nav className="mb-6 text-sm text-muted">
        <Link href="/products">全部商品</Link>
        {product.category.parent && <> / <Link href={`/products?category=${product.category.parent.slug}`}>{product.category.parent.name}</Link></>}
        {" / "}<Link href={`/products?category=${product.category.slug}`}>{product.category.name}</Link>
      </nav>

      <VariantPicker
        variants={product.variants}
        images={product.images}
        returnTo={path}
        footer={
          <form action={toggleWishlistAction}>
            <input type="hidden" name="productId" value={product.id} />
            <input type="hidden" name="returnTo" value={path} />
            <button className="text-sm text-muted underline hover:text-ink">{wished ? "♥ 已收藏（點擊取消）" : "♡ 加入收藏"}</button>
          </form>
        }
      >
        <div>
          <h1 className="text-2xl font-bold">{product.name}</h1>
          {n > 0 && <a href="#reviews" className="mt-1 inline-block text-sm text-muted">{"★".repeat(Math.round(avg))}{"☆".repeat(5 - Math.round(avg))} {avg.toFixed(1)}（{n} 則評論）</a>}
          <Price price={product.price} salePrice={product.salePrice} className="mt-3 text-xl" />
          <p className="mt-4 text-sm leading-relaxed">{product.description}</p>
        </div>
      </VariantPicker>

      <div className="mt-12 grid gap-6 md:grid-cols-3">
        <div className="card p-5 text-sm">
          <p className="font-bold">商品資訊</p>
          <p className="mt-2"><span className="text-muted">材質：</span>{product.material}</p>
          <p className="mt-1"><span className="text-muted">洗滌：</span>{product.care}</p>
          <p className="mt-1"><span className="text-muted">商品編號：</span>{product.variants[0]?.sku.split("-")[0]}</p>
        </div>
        <div className="card p-5 text-sm">
          <p className="font-bold">運送與退換貨</p>
          <p className="mt-2">滿 NT${SHIPPING.freeThreshold.toLocaleString()} 免運，未滿宅配 NT${SHIPPING.fee.HOME}、超取 NT${SHIPPING.fee.CVS}。</p>
          <p className="mt-1">收到商品後 {RETURN_WINDOW_DAYS} 天內可申請退換貨，商品需保持全新、吊牌未剪。</p>
          <Link href="/faq#退換貨" className="mt-2 inline-block text-brand underline">完整退換貨政策</Link>
        </div>
        {!isAccessory && (
          <div id="size-guide" className="card p-5 text-sm">
            <p className="font-bold">尺寸表（公分）</p>
            <table className="mt-2 w-full text-center">
              <tbody>
                {chart.map((row, i) => (
                  <tr key={i} className={i === 0 ? "text-muted" : "border-t border-line"}>
                    {row.map((c, j) => <td key={j} className="py-1">{c}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <section id="reviews" className="mt-12">
        <h2 className="text-xl font-bold">顧客評論（{n}）</h2>
        {n > 0 && (
          <p className="mt-2 text-sm text-muted">
            尺寸回饋：偏小 {fit.SMALL}・剛好 {fit.TRUE}・偏大 {fit.LARGE}
          </p>
        )}
        <div className="mt-4 space-y-4">
          {product.reviews.slice(0, 10).map((r) => (
            <div key={r.id} className="border-b border-line pb-4 text-sm">
              <p className="text-accent">{"★".repeat(r.rating)}<span className="text-line">{"★".repeat(5 - r.rating)}</span></p>
              <p className="mt-1 font-medium">{r.title}</p>
              <p className="mt-1">{r.body}</p>
              <p className="mt-1 text-xs text-muted">{r.user.name.slice(0, 1)}＊＊・{formatDate(r.createdAt)}{r.fit && `・尺寸${r.fit === "TRUE" ? "剛好" : r.fit === "SMALL" ? "偏小" : "偏大"}`}</p>
            </div>
          ))}
          {n === 0 && <p className="text-sm text-muted">還沒有評論。購買並收到商品後就可以留下評論。</p>}
        </div>
      </section>
    </div>
  );
}
