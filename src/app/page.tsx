import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { productCardSelect } from "@/lib/catalog";
import { ProductCard } from "@/components/ProductCard";
import { garmentImageUrl } from "@/lib/store-config";

const TILES = [
  { slug: "men", label: "男裝", type: "jacket", color: "#24324A" },
  { slug: "women", label: "女裝", type: "dress", color: "#9CAF88" },
  { slug: "accessories", label: "配件", type: "tote", color: "#E9E2D3" },
];

export default async function HomePage() {
  const [featured, newest] = await Promise.all([
    prisma.product.findMany({ where: { status: "ACTIVE", isFeatured: true }, take: 8, orderBy: { createdAt: "desc" }, select: productCardSelect }),
    prisma.product.findMany({ where: { status: "ACTIVE" }, take: 4, orderBy: { createdAt: "desc" }, select: productCardSelect }),
  ]);

  return (
    <div>
      {/* Hero */}
      <section className="bg-sand">
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-14 md:grid-cols-2 md:py-20">
          <div>
            <p className="text-sm tracking-widest text-brand">AUTUMN / WINTER 2026</p>
            <h1 className="mt-3 text-4xl leading-tight font-bold md:text-5xl">
              日常好穿的
              <br />
              基本款
            </h1>
            <p className="mt-4 max-w-md text-muted">好的布料、耐看的版型、合理的價格。秋季全館滿 NT$1,500 輸入 AUTUMN15 享 85 折。</p>
            <div className="mt-8 flex gap-3">
              <Link href="/products?category=women" className="btn-primary">逛女裝</Link>
              <Link href="/products?category=men" className="btn-outline">逛男裝</Link>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[["hoodie", "#9A9A9A"], ["cardigan", "#B08D6E"], ["shirt", "#8FB3D9"], ["pants", "#C3B091"]].map(([t, c]) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={t} src={garmentImageUrl(t, c)} alt="" className="aspect-square w-full rounded-2xl" />
            ))}
          </div>
        </div>
      </section>

      {/* 分類 */}
      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-4 sm:grid-cols-3">
          {TILES.map((t) => (
            <Link key={t.slug} href={`/products?category=${t.slug}`} className="group relative overflow-hidden rounded-2xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={garmentImageUrl(t.type, t.color)} alt="" className="aspect-[4/3] w-full object-cover transition group-hover:scale-105" />
              <span className="absolute bottom-4 left-4 rounded-full bg-card px-4 py-1.5 text-sm font-medium">{t.label} →</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-6 flex items-end justify-between">
          <h2 className="text-2xl font-bold">人氣推薦</h2>
          <Link href="/products" className="text-sm text-brand underline">看全部商品</Link>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4">
          {featured.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="mb-6 text-2xl font-bold">新品上架</h2>
        <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4">
          {newest.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4">
        <div className="grid gap-4 rounded-2xl bg-brand p-8 text-white sm:grid-cols-3">
          <div><p className="font-bold">滿 NT$1,500 免運</p><p className="mt-1 text-sm text-white/75">宅配、超商取貨都適用</p></div>
          <div><p className="font-bold">7 天鑑賞期</p><p className="mt-1 text-sm text-white/75">尺寸不合第一次換貨免運費</p></div>
          <div><p className="font-bold">多元付款</p><p className="mt-1 text-sm text-white/75">信用卡、LINE Pay、ATM、貨到付款</p></div>
        </div>
      </section>
    </div>
  );
}
