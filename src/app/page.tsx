import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { productCardSelect } from "@/lib/catalog";
import { ProductCard, Rail } from "@/components/ProductCard";
import { PAYMENT_METHOD_LABEL, RETURN_WINDOW_DAYS, SHIPPING } from "@/lib/store-config";

const STALLS = [
  { slug: "women", name: "女裝" },
  { slug: "men", name: "男裝" },
  { slug: "accessories", name: "配件" },
];

export default async function HomePage() {
  const active = { status: "ACTIVE" as const };
  const [featured, sale, stalls, materials] = await Promise.all([
    prisma.product.findMany({ where: { ...active, isFeatured: true }, take: 4, orderBy: { createdAt: "desc" }, select: productCardSelect }),
    prisma.product.findMany({ where: { ...active, salePrice: { not: null } }, take: 4, orderBy: { createdAt: "desc" }, select: productCardSelect }),
    Promise.all(
      STALLS.map(async (s) => ({
        ...s,
        count: await prisma.product.count({ where: { ...active, category: { OR: [{ slug: s.slug }, { parent: { slug: s.slug } }] } } }),
        items: await prisma.product.findMany({
          where: { ...active, isFeatured: false, category: { OR: [{ slug: s.slug }, { parent: { slug: s.slug } }] } },
          take: 4,
          orderBy: { createdAt: "desc" },
          select: productCardSelect,
        }),
      })),
    ),
    // 布料牆：直接用資料庫裡商品的材質，不另外編故事
    prisma.product.findMany({
      where: active,
      distinct: ["material"],
      select: { material: true, care: true, slug: true, name: true, variants: { select: { colorHex: true }, take: 1 } },
      take: 6,
    }),
  ]);

  return (
    <div>
      {/* 第一屏：攤位正面 */}
      <section className="pegboard pt-10 pb-16">
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="card max-w-xl -rotate-1 px-6 py-5">
              <h1 className="text-3xl leading-tight font-black md:text-[42px]">今天掛出來的</h1>
              <p className="mt-3 max-w-md text-[15px] leading-relaxed text-muted">
                北織是台灣的小量製作服飾品牌（作品集虛構）。每一批只做一點點，賣完就等下一批；價錢寫在吊牌上，點一件就能挑尺寸。
              </p>
            </div>
            <Link href="/products" className="neon-card group rotate-3 px-5 py-4 transition-transform hover:rotate-1">
              <span className="block text-2xl leading-tight font-black">全部商品<br />都掛在這</span>
              <span className="mt-1 block text-sm font-bold underline decoration-2 underline-offset-4">去逛整排 →</span>
            </Link>
          </div>

          <Rail className="mt-12">
            {featured.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}
          </Rail>

          <div className="mt-16 grid gap-6 md:grid-cols-[1.3fr_1fr]">
            <div className="card rotate-[0.6deg] px-6 py-5">
              <h2 className="text-xl font-black">這攤的規矩</h2>
              <ol className="mt-3 space-y-2.5 text-[15px] leading-relaxed">
                <li><b>滿 NT${SHIPPING.freeThreshold.toLocaleString()} 免運。</b>未滿宅配 NT${SHIPPING.fee.HOME}、超商取貨 NT${SHIPPING.fee.CVS}。</li>
                <li><b>收到後 {RETURN_WINDOW_DAYS} 天內可以退換。</b>尺寸不合，第一次換貨我們出運費。</li>
                <li><b>付款方式：</b>{Object.values(PAYMENT_METHOD_LABEL).join("、")}。</li>
              </ol>
              <Link href="/faq" className="mt-4 inline-block text-sm font-bold underline decoration-2">其他問題看這裡</Link>
            </div>
            <div className="kraft-tag -rotate-1 px-6 py-5">
              <h2 className="text-xl font-black">直接找你要的</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {[["女裝", "women"], ["男裝", "men"], ["配件", "accessories"], ["上衣", "women-tops"], ["外套", "men-outerwear"], ["洋裝", "women-dresses"], ["褲裝", "men-bottoms"], ["帽子", "acc-caps"]].map(([label, slug]) => (
                  <Link key={slug} href={`/products?category=${slug}`} className="rounded-sm bg-card px-3 py-1.5 text-sm font-bold shadow-sm hover:bg-white">
                    {label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 特價區：螢光卡 */}
      {sale.length > 0 && (
        <section className="bg-paper py-16">
          <div className="mx-auto max-w-6xl px-4">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h2 className="neon-card -rotate-1 px-4 py-2 text-3xl font-black">特價，數量不多</h2>
              <Link href="/products?sale=1" className="text-sm font-bold underline decoration-2">看全部特價</Link>
            </div>
            <Rail className="mt-12">
              {sale.map((p, i) => <ProductCard key={p.id} product={p} index={i + 2} />)}
            </Rail>
          </div>
        </section>
      )}

      {/* 各區衣架 */}
      <section className="pegboard py-16">
        <div className="mx-auto max-w-6xl space-y-20 px-4">
          {stalls.map((s, si) => (
            <div key={s.slug}>
              <div className="flex items-end justify-between gap-4">
                <h2 className="kraft-tag px-5 py-2 text-3xl font-black" style={{ transform: `rotate(${si % 2 ? 1 : -1}deg)` }}>
                  {s.name}
                </h2>
                <Link href={`/products?category=${s.slug}`} className="rounded-sm bg-card px-3 py-1.5 text-sm font-bold shadow-sm hover:bg-white">
                  整區 {s.count} 件 →
                </Link>
              </div>
              <Rail className="mt-12">
                {s.items.map((p, i) => <ProductCard key={p.id} product={p} index={i + si} />)}
              </Rail>
            </div>
          ))}
        </div>
      </section>

      {/* 布料牆：每塊樣布對應一件真的商品 */}
      <section className="bg-paper py-16">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-3xl font-black">我們用的布</h2>
          <p className="mt-2 max-w-xl text-[15px] text-muted">每張樣布卡都是店裡正在賣的商品材質，點下去看那一件。</p>
          <div className="mt-10 grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {materials.map((m, i) => (
              <Link
                key={m.material}
                href={`/products/${m.slug}`}
                className="kraft-tag group flex gap-4 p-4 transition-transform hover:-translate-y-0.5"
                style={{ transform: `rotate(${[-1, 0.8, -0.5][i % 3]}deg)` }}
              >
                {/* 釘在卡上的樣布 */}
                <span
                  aria-hidden
                  className="relative h-20 w-20 shrink-0 shadow-[0_2px_4px_rgb(0_0_0/.3)]"
                  style={{
                    backgroundColor: m.variants[0]?.colorHex,
                    backgroundImage: "repeating-linear-gradient(45deg, rgb(0 0 0 / .08) 0 1px, transparent 1px 4px), repeating-linear-gradient(-45deg, rgb(255 255 255 / .08) 0 1px, transparent 1px 4px)",
                  }}
                >
                  <span className="absolute top-1 left-1/2 h-1 w-6 -translate-x-1/2 bg-[#9aa0a4]" />
                </span>
                <span className="text-sm">
                  <span className="block font-black">{m.material}</span>
                  <span className="mt-1 block text-ink/75">{m.care}</span>
                  <span className="mt-2 block font-bold underline decoration-2 group-hover:no-underline">{m.name}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
