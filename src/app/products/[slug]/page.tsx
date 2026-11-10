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
import { TrackView } from "@/components/chat/TrackView";
import { SIZE_CHART, sizeChartFor } from "@/lib/size-chart";

export async function generateMetadata({ params }: PageProps<"/products/[slug]">): Promise<Metadata> {
  const product = await getProductBySlug((await params).slug);
  return { title: product?.name ?? "找不到商品", description: product?.description };
}

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
  const chart = sizeChartFor(product.garmentType, product.variants.map((v) => v.size)) ?? SIZE_CHART.top;
  const isAccessory = product.variants.every((v) => v.size === "F");
  const path = `/products/${slug}`;

  return (
    <div>
      {/* 記錄瀏覽紀錄，給推薦用 */}
      <TrackView productId={product.id} />
      <section className="container-x pt-8 md:pt-10">
        <nav aria-label="麵包屑" className="mb-8 flex flex-wrap items-center gap-2 text-sm text-muted">
          <Link href="/products" className="hover:text-ink">全部商品</Link>
          {product.category.parent && (
            <>
              <span aria-hidden>/</span>
              <Link href={`/products?category=${product.category.parent.slug}`} className="hover:text-ink">{product.category.parent.name}</Link>
            </>
          )}
          <span aria-hidden>/</span>
          <Link href={`/products?category=${product.category.slug}`} className="font-bold text-ink">{product.category.name}</Link>
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
            <form action={toggleWishlistAction} className="border-t border-line pt-6">
              <input type="hidden" name="productId" value={product.id} />
              <input type="hidden" name="returnTo" value={path} />
              <button className="inline-flex items-center gap-2 text-sm font-bold">
                <svg aria-hidden viewBox="0 0 20 20" className={wished ? "h-5 w-5 fill-mark text-mark" : "h-5 w-5 fill-none"}>
                  <path d="M10 17 C4 13 2 10 2 7 a4 4 0 0 1 8 -1.5 a4 4 0 0 1 8 1.5 c0 3 -2 6 -8 10 Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                </svg>
                <span className="underline decoration-ink/30 underline-offset-4 hover:decoration-ink">{wished ? "已收藏，點一下取消" : "加入收藏"}</span>
              </button>
            </form>
          }
        >
          <div>
            <p className="font-mono text-sm font-semibold tracking-wider text-muted">{productCode(product.slug)}</p>
            <h1 className="display mt-2 text-[clamp(32px,3.6vw,48px)] leading-[1.1]">{product.name}</h1>
            {n > 0 && (
              <a href="#reviews" className="mt-3 inline-flex items-center gap-2 text-sm">
                <span className="flex text-ink" aria-hidden>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <svg key={i} viewBox="0 0 20 20" className={i <= Math.round(avg) ? "h-4 w-4 fill-current" : "h-4 w-4 fill-ink/15"}>
                      <path d="M10 2 L12.4 7.2 L18 7.8 L13.8 11.6 L15 17.2 L10 14.4 L5 17.2 L6.2 11.6 L2 7.8 L7.6 7.2 Z" />
                    </svg>
                  ))}
                </span>
                <span className="font-bold underline decoration-ink/30 underline-offset-4">{avg.toFixed(1)}・{n} 則評論</span>
              </a>
            )}
            <p className="mt-5 text-[15px] leading-[1.85] text-ink/80">{product.description}</p>
          </div>
        </VariantPicker>
      </section>

      {/* 細節：三欄，用細線分隔 */}
      <section className="container-x mt-24 grid gap-10 border-t border-line pt-12 md:grid-cols-3 md:gap-12">
        <div className="text-sm">
          <h2 className="display text-2xl">布料與照顧</h2>
          <dl className="mt-5 space-y-4">
            <div><dt className="text-xs font-bold tracking-[0.15em] text-muted">材質</dt><dd className="mt-1 font-bold">{product.material}</dd></div>
            <div><dt className="text-xs font-bold tracking-[0.15em] text-muted">洗滌</dt><dd className="mt-1 leading-relaxed">{product.care}</dd></div>
          </dl>
        </div>
        <div className="text-sm">
          <h2 className="display text-2xl">運費與退換</h2>
          <p className="mt-5 leading-relaxed">滿 NT${SHIPPING.freeThreshold.toLocaleString()} 免運，未滿宅配 NT${SHIPPING.fee.HOME}、超商取貨 NT${SHIPPING.fee.CVS}。</p>
          <p className="mt-3 leading-relaxed">收到後 {RETURN_WINDOW_DAYS} 天內可申請退換，商品要保持全新、吊牌沒剪。</p>
          <Link href="/faq#退換貨" className="mt-4 inline-block font-bold underline decoration-ink/30 underline-offset-4 hover:decoration-ink">完整退換貨規則</Link>
        </div>
        {!isAccessory && (
          <div id="size-guide" className="scroll-mt-32 text-sm">
            <h2 className="display text-2xl">尺寸表<span className="ml-2 font-sans text-sm font-normal text-muted">公分</span></h2>
            <table className="mt-5 w-full text-center font-mono tabular-nums">
              <tbody>
                {chart.map((row, i) => (
                  <tr key={i} className={i === 0 ? "text-xs text-muted" : "border-t border-line"}>
                    {row.map((c, j) => <td key={j} className={j === 0 && i > 0 ? "py-2 text-left font-semibold" : "py-2"}>{c}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section id="reviews" className="container-x mt-24 scroll-mt-32">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <h2 className="display text-[clamp(28px,3vw,40px)]">買過的人怎麼說</h2>
          {n > 0 && (
            <p className="text-sm text-muted">
              {n} 則・平均 {avg.toFixed(1)} 分・尺寸：偏小 {fit.SMALL}、剛好 {fit.TRUE}、偏大 {fit.LARGE}
            </p>
          )}
        </div>
        {n === 0 ? (
          <p className="mt-4 text-sm text-muted">還沒有評論。收到商品之後就可以寫。</p>
        ) : (
          <div className="mt-8 columns-1 gap-5 md:columns-2 lg:columns-3">
            {product.reviews.slice(0, 10).map((r) => (
              <article key={r.id} className="card mb-5 break-inside-avoid p-6 text-sm">
                <p className="flex items-center gap-2">
                  <span className="rounded-full bg-ink px-2 py-0.5 font-mono text-xs font-semibold text-white">{r.rating}.0</span>
                  <span className="font-black">{r.title}</span>
                </p>
                <p className="mt-3 leading-relaxed text-ink/80">{r.body}</p>
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
