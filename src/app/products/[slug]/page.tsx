import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProductBySlug } from "@/lib/catalog";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { RETURN_WINDOW_DAYS, SHIPPING, formatDate } from "@/lib/store-config";
import { toggleWishlistAction } from "@/app/cart/actions";
import { productCode } from "@/components/ProductCard";
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
const FIT_LABEL: Record<string, string> = { SMALL: "偏小", TRUE: "剛好", LARGE: "偏大" };

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
    <div>
      <section className="pegboard pt-8 pb-16">
        <div className="mx-auto max-w-6xl px-4">
          <nav aria-label="麵包屑" className="mb-8 inline-flex flex-wrap gap-1 rounded-sm bg-card/90 px-3 py-1.5 text-sm shadow-sm">
            <Link href="/products" className="hover:underline">全部商品</Link>
            {product.category.parent && <>/<Link href={`/products?category=${product.category.parent.slug}`} className="hover:underline">{product.category.parent.name}</Link></>}
            /<Link href={`/products?category=${product.category.slug}`} className="font-bold hover:underline">{product.category.name}</Link>
          </nav>

          <VariantPicker
            variants={product.variants}
            images={product.images}
            returnTo={path}
            code={productCode(product.slug)}
            name={product.name}
            price={product.price}
            salePrice={product.salePrice}
            footer={
              <form action={toggleWishlistAction} className="border-t border-line pt-4">
                <input type="hidden" name="productId" value={product.id} />
                <input type="hidden" name="returnTo" value={path} />
                <button className="text-sm font-bold underline decoration-2 hover:no-underline">{wished ? "已收藏，點一下取消" : "加入收藏，補貨或降價時比較好找"}</button>
              </form>
            }
          >
            <div>
              <h1 className="text-3xl leading-tight font-black">{product.name}</h1>
              {n > 0 && (
                <a href="#reviews" className="mt-2 inline-block text-sm font-bold underline decoration-2">
                  {n} 則評論，平均 {avg.toFixed(1)} 分
                </a>
              )}
              <p className="mt-4 text-[15px] leading-relaxed">{product.description}</p>
            </div>
          </VariantPicker>
        </div>
      </section>

      <section className="mx-auto mt-12 grid max-w-6xl gap-5 px-4 md:grid-cols-3">
        <div className="card p-5 text-sm">
          <h2 className="font-black">布料與照顧</h2>
          <dl className="mt-3 space-y-2">
            <div><dt className="text-muted">材質</dt><dd className="font-bold">{product.material}</dd></div>
            <div><dt className="text-muted">洗滌</dt><dd>{product.care}</dd></div>
            <div><dt className="text-muted">商品編號</dt><dd className="font-marker">{productCode(product.slug)}</dd></div>
          </dl>
        </div>
        <div className="card p-5 text-sm">
          <h2 className="font-black">運費與退換</h2>
          <p className="mt-3 leading-relaxed">滿 NT${SHIPPING.freeThreshold.toLocaleString()} 免運，未滿宅配 NT${SHIPPING.fee.HOME}、超商取貨 NT${SHIPPING.fee.CVS}。</p>
          <p className="mt-2 leading-relaxed">收到後 {RETURN_WINDOW_DAYS} 天內可申請退換，商品要保持全新、吊牌沒剪。</p>
          <Link href="/faq#退換貨" className="mt-3 inline-block font-bold underline decoration-2">完整退換貨規則</Link>
        </div>
        {!isAccessory && (
          <div id="size-guide" className="card scroll-mt-24 p-5 text-sm">
            <h2 className="font-black">尺寸表（公分）</h2>
            <table className="mt-3 w-full text-center tabular-nums">
              <tbody>
                {chart.map((row, i) => (
                  <tr key={i} className={i === 0 ? "text-muted" : "border-t border-line"}>
                    {row.map((c, j) => <td key={j} className={j === 0 && i > 0 ? "py-1.5 text-left font-bold" : "py-1.5"}>{c}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section id="reviews" className="mx-auto mt-14 max-w-6xl scroll-mt-24 px-4">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <h2 className="text-2xl font-black">買過的人怎麼說</h2>
          {n > 0 && (
            <p className="text-sm text-muted">
              {n} 則・平均 {avg.toFixed(1)} 分・尺寸：偏小 {fit.SMALL}、剛好 {fit.TRUE}、偏大 {fit.LARGE}
            </p>
          )}
        </div>
        {n === 0 ? (
          <p className="mt-4 text-sm text-muted">還沒有評論。收到商品之後就可以寫。</p>
        ) : (
          <div className="mt-6 columns-1 gap-5 md:columns-2">
            {product.reviews.slice(0, 10).map((r) => (
              <article key={r.id} className="card mb-5 break-inside-avoid p-5 text-sm">
                <p className="flex items-center gap-2">
                  <span className="font-marker text-xl leading-none">{r.rating}/5</span>
                  <span className="font-black">{r.title}</span>
                </p>
                <p className="mt-2 leading-relaxed">{r.body}</p>
                <p className="mt-3 text-xs text-muted">
                  {r.user.name.slice(0, 1)}＊＊・{formatDate(r.createdAt)}{r.fit && `・尺寸${FIT_LABEL[r.fit]}`}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
