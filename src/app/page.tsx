import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { productCardSelect } from "@/lib/catalog";
import { ProductCard, Rail, productCode } from "@/components/ProductCard";
import { Reveal } from "@/components/motion/Reveal";
import { Marquee } from "@/components/motion/Marquee";
import { PAYMENT_METHOD_LABEL, RETURN_WINDOW_DAYS, SHIPPING } from "@/lib/store-config";
import { cn } from "@/lib/utils";
import { HeroRail } from "./HeroRail";

const STALLS = [
  { slug: "women", name: "女裝", note: "上衣、洋裝、針織" },
  { slug: "men", name: "男裝", note: "襯衫、外套、褲裝" },
  { slug: "accessories", name: "配件", note: "帽子、包款" },
];

// 箭頭圖示
function Arrow({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className={cn("h-4 w-4", className)}>
      <path d="M4 10 H15 M11 5.5 L15.5 10 L11 14.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// 區塊標題：大字明體 + 右邊一個「看全部」連結
function SectionHead({ title, sub, href, linkLabel, dark }: { title: string; sub?: string; href?: string; linkLabel?: string; dark?: boolean }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
      <div>
        <h2 className="display text-[clamp(32px,4.4vw,56px)] leading-[1.05]">{title}</h2>
        {sub && <p className={cn("mt-3 max-w-lg text-[15px] leading-relaxed", dark ? "text-white/70" : "text-muted")}>{sub}</p>}
      </div>
      {href && (
        <Link href={href} className={cn("group inline-flex items-center gap-2 border-b pb-1 text-sm font-bold transition-colors", dark ? "border-white/40 hover:border-neon hover:text-neon" : "border-ink/40 hover:border-ink")}>
          {linkLabel}
          <Arrow className="transition-transform group-hover:translate-x-1" />
        </Link>
      )}
    </div>
  );
}

export default async function HomePage() {
  const active = { status: "ACTIVE" as const };
  const inCategory = (slug: string) => ({ ...active, category: { OR: [{ slug }, { parent: { slug } }] } });
  const [featured, sale, stalls, materials, totalActive] = await Promise.all([
    prisma.product.findMany({ where: { ...active, isFeatured: true }, take: 7, orderBy: { createdAt: "desc" }, select: productCardSelect }),
    prisma.product.findMany({ where: { ...active, salePrice: { not: null } }, take: 4, orderBy: { createdAt: "desc" }, select: productCardSelect }),
    Promise.all(
      STALLS.map(async (s) => ({
        ...s,
        count: await prisma.product.count({ where: inCategory(s.slug) }),
        cover: await prisma.product.findFirst({ where: inCategory(s.slug), orderBy: { createdAt: "desc" }, select: { images: { take: 1, select: { url: true } } } }),
      })),
    ),
    // 布料：直接用資料庫裡商品的材質，不另外編故事
    prisma.product.findMany({
      where: active,
      distinct: ["material"],
      select: { material: true, care: true, slug: true, name: true, variants: { select: { colorHex: true }, take: 1 } },
      take: 6,
    }),
    prisma.product.count({ where: active }),
  ]);

  const hero = featured.slice(0, 3).map((p) => ({
    slug: p.slug,
    code: productCode(p.slug),
    name: p.name,
    price: p.price,
    salePrice: p.salePrice,
    image: p.images[0]?.url ?? "",
    alt: p.images[0]?.alt ?? p.name,
  }));
  const weekly = featured.slice(3, 7).length === 4 ? featured.slice(3, 7) : featured.slice(0, 4);

  return (
    <div>
      {/* ───── 第一屏：攤位正面 ───── */}
      <section className="pegboard relative overflow-hidden">
        <div className="container-x grid min-h-[calc(100svh-104px)] items-center gap-12 py-14 md:py-20 lg:grid-cols-[1.05fr_1fr] lg:gap-8">
          <div>
            <h1 className="display text-[clamp(40px,5.6vw,80px)] leading-[1.06]">
              <span className="block whitespace-nowrap">日常的衣服</span>
              <span className="block whitespace-nowrap">一批一批地做</span>
            </h1>
            <p className="mt-6 max-w-md text-base leading-relaxed text-ink/75 md:text-lg">
              北織是台灣的小量製作服飾品牌（作品集虛構）。每一批只做一點點，賣完就等下一批。
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/products" className="btn-primary h-12 px-7 text-base">
                逛全部商品 <Arrow />
              </Link>
              <Link href="/products?sale=1" className="btn-outline h-12 bg-paper/60 px-7 text-base backdrop-blur-sm">
                看特價
              </Link>
            </div>
            {/* 三個真實的數字（從資料庫與設定檔來） */}
            <dl className="mt-12 grid max-w-md grid-cols-3 divide-x divide-ink/15 border-y border-ink/15 py-4">
              {[
                [String(totalActive), "款在架上"],
                [String(RETURN_WINDOW_DAYS), "天內可退換"],
                [SHIPPING.freeThreshold.toLocaleString(), "元以上免運"],
              ].map(([n, label]) => (
                <div key={label} className="px-4 first:pl-0">
                  <dt className="sr-only">{label}</dt>
                  <dd>
                    <span className="block font-mono text-2xl font-semibold tabular-nums">{n}</span>
                    <span className="mt-1 block text-xs font-bold text-ink/65">{label}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
          <HeroRail items={hero} />
        </div>
      </section>

      {/* ───── 紅布條跑馬燈 ───── */}
      <Marquee
        items={["小量製作", "賣完等下一批", "台灣在地設計", "看得到布料", `${RETURN_WINDOW_DAYS} 天鑑賞期`, "超商取貨"]}
        className="bg-mark py-4 font-serif text-[clamp(22px,2.6vw,34px)] font-black text-white"
      />

      {/* ───── 分類：三個大格子 ───── */}
      <section className="container-x pt-24 md:pt-32">
        <Reveal>
          <SectionHead title="今天從哪一攤逛起？" />
        </Reveal>
        <div className="mt-10 grid gap-4 md:grid-cols-[1.25fr_1fr] md:grid-rows-2 md:gap-5">
          {stalls.map((s, i) => (
            <Reveal key={s.slug} delay={i * 90} className={cn(i === 0 && "md:row-span-2")}>
              <Link
                href={`/products?category=${s.slug}`}
                className={cn(
                  "pegboard-soft group relative flex h-full overflow-hidden rounded-card p-7 md:p-9",
                  i === 0 ? "min-h-[360px] md:min-h-[560px]" : "min-h-[260px]",
                )}
              >
                <div className="relative z-10 flex flex-col">
                  <h3 className="display text-[clamp(36px,4vw,60px)] leading-none">{s.name}</h3>
                  <p className="mt-3 text-sm font-bold text-ink/65">{s.note}</p>
                  <span className="mt-auto inline-flex items-center gap-2 pt-8 text-sm font-bold">
                    <span className="font-mono tabular-nums">{s.count}</span> 件
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-ink text-white transition-transform duration-300 group-hover:translate-x-1.5">
                      <Arrow />
                    </span>
                  </span>
                </div>
                {s.cover?.images[0] && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={s.cover.images[0].url}
                    alt=""
                    loading="lazy"
                    className={cn(
                      "absolute aspect-square drop-shadow-[0_20px_20px_rgb(0_0_0/.15)] transition-transform duration-700 ease-[var(--ease-out-soft)] group-hover:-translate-y-3 group-hover:-rotate-2",
                      i === 0 ? "right-[-6%] bottom-[-8%] w-[72%] md:w-[80%]" : "right-[2%] bottom-[-12%] h-[100%]",
                    )}
                  />
                )}
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ───── 這週掛出來的 ───── */}
      <section className="container-x pt-24 md:pt-32">
        <Reveal>
          <SectionHead title="這週掛出來的" sub="新到的一批，每款數量不多。" href="/products" linkLabel="看全部商品" />
        </Reveal>
        <Rail className="mt-10">
          {weekly.map((p, i) => (
            <Reveal key={p.id} delay={i * 80}>
              <ProductCard product={p} />
            </Reveal>
          ))}
        </Rail>
      </section>

      {/* ───── 特價：深色區塊 ───── */}
      {sale.length > 0 && (
        <section className="mt-24 bg-ink py-20 text-white md:mt-32 md:py-28">
          <div className="container-x">
            <Reveal>
              <SectionHead dark title="特價，數量不多" sub="賣完就不會再補這個價錢。" href="/products?sale=1" linkLabel="看全部特價" />
            </Reveal>
            <Rail className="mt-10">
              {sale.map((p, i) => (
                <Reveal key={p.id} delay={i * 80}>
                  <ProductCard product={p} tone="dark" />
                </Reveal>
              ))}
            </Rail>
          </div>
        </section>
      )}

      {/* ───── 布料樣本 ───── */}
      <section className="container-x pt-24 md:pt-32">
        <Reveal>
          <SectionHead title="我們用的布" sub="每一塊都是店裡正在賣的商品材質，點下去看那一件。" />
        </Reveal>
        <div className="mt-10 grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 md:gap-x-6 lg:grid-cols-6">
          {materials.map((m, i) => (
            <Reveal key={m.material} delay={i * 60}>
              <Link href={`/products/${m.slug}`} className="group block">
                {/* 布料樣本：用商品顏色畫出織紋 */}
                <span
                  aria-hidden
                  className="block aspect-[4/5] rounded-card shadow-[inset_0_0_0_1px_rgb(0_0_0/.06)] transition-transform duration-500 ease-[var(--ease-out-soft)] group-hover:-translate-y-1.5"
                  style={{
                    backgroundColor: m.variants[0]?.colorHex,
                    backgroundImage:
                      "repeating-linear-gradient(45deg, rgb(0 0 0 / .07) 0 1px, transparent 1px 4px), repeating-linear-gradient(-45deg, rgb(255 255 255 / .09) 0 1px, transparent 1px 4px)",
                  }}
                />
                <span className="mt-3 block text-sm font-bold">{m.material}</span>
                <span className="mt-1 block text-xs leading-relaxed text-muted">{m.care}</span>
                <span className="mt-2 inline-flex items-center gap-1 text-xs font-bold underline-offset-4 group-hover:underline">
                  {m.name}
                </span>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ───── 這攤的規矩 ───── */}
      <section className="container-x pt-24 md:pt-32">
        <Reveal className="grid gap-px overflow-hidden rounded-card border border-line bg-line md:grid-cols-3">
          {[
            [`${SHIPPING.freeThreshold.toLocaleString()}`, "元以上免運", `未滿宅配 NT$${SHIPPING.fee.HOME}、超商取貨 NT$${SHIPPING.fee.CVS}。`],
            [`${RETURN_WINDOW_DAYS}`, "天內可以退換", "尺寸不合，第一次換貨我們出運費。"],
            [`${Object.keys(PAYMENT_METHOD_LABEL).length}`, "種付款方式", `${Object.values(PAYMENT_METHOD_LABEL).join("、")}。`],
          ].map(([n, title, body]) => (
            <div key={title} className="bg-card p-8 md:p-10">
              <p className="font-mono text-[clamp(44px,5vw,64px)] leading-none font-semibold tabular-nums">{n}</p>
              <p className="mt-4 text-lg font-black">{title}</p>
              <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
            </div>
          ))}
        </Reveal>
        <p className="mt-6 text-center text-sm">
          其他問題？<Link href="/faq" className="font-bold underline decoration-ink/40 hover:decoration-ink">看常見問題</Link>，或點右下角問小織。
        </p>
      </section>
    </div>
  );
}
