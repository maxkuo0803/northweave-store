import Link from "next/link";
import type { ProductCardData } from "@/lib/catalog";
import { formatPrice } from "@/lib/store-config";
import { cn } from "@/lib/utils";

export function productCode(slug: string) {
  return slug.split("-")[0].toUpperCase();
}

// 掛鉤（SVG）：商品卡、商品頁、首頁共用
export function Hook({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 34" className={cn("text-rail", className)}>
      <path d="M12 0 V10 Q12 17 6 17 Q1 17 1 12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M12 10 V34" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

/**
 * 商品卡：上半部是一塊淡淡的洞洞板「商品台」，衣服掛在鐵桿上；
 * 右上角一張小吊牌寫編號。下半部是乾淨的文字：品名、顏色、價錢。
 * 滑鼠移上去：衣服往上提一點、吊牌晃一下。
 */
export function ProductCard({ product, tone = "light" }: { product: ProductCardData; index?: number; tone?: "light" | "dark" }) {
  const dark = tone === "dark";
  const colors = [...new Map(product.variants.map((v) => [v.color, v.colorHex])).entries()];
  const soldOut = product.variants.every((v) => v.stock === 0);
  const img = product.images[0];
  const off = product.salePrice ? Math.round((1 - product.salePrice / product.price) * 100) : 0;

  return (
    <Link
      href={`/products/${product.slug}`}
      className={cn("group block rounded-card outline-none focus-visible:ring-2 focus-visible:ring-offset-4", dark ? "focus-visible:ring-neon focus-visible:ring-offset-ink" : "focus-visible:ring-ink focus-visible:ring-offset-paper")}
      aria-label={`${product.name}，${formatPrice(product.salePrice ?? product.price)}${soldOut ? "，已售完" : ""}`}
    >
      {/* 商品台 */}
      <div className="pegboard-soft relative aspect-[4/5] overflow-hidden rounded-card transition-shadow duration-500 group-hover:shadow-[0_24px_48px_-28px_rgb(20_20_19/.45)]">
        {/* 鐵桿 */}
        <span aria-hidden className="absolute inset-x-0 top-[9%] h-[5px] bg-rail/90 shadow-[0_2px_0_rgb(0_0_0/.12)]" />
        <div className="absolute inset-x-0 top-[9%] flex flex-col items-center transition-transform duration-500 ease-[var(--ease-out-soft)] group-hover:-translate-y-1.5">
          <Hook className="-mt-[3px] h-8 w-5" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={img?.url}
            alt={img?.alt ?? product.name}
            loading="lazy"
            className={cn("-mt-3 aspect-square w-[80%] transition-transform duration-700 ease-[var(--ease-out-soft)] group-hover:scale-[1.03]", soldOut && "opacity-55 grayscale")}
          />
        </div>

        {/* 小吊牌：編號 */}
        <span className="swing-tag swing-on-hover absolute top-[calc(9%+5px)] right-[8%] flex flex-col items-center">
          <span aria-hidden className="h-3 w-px bg-rail/60" />
          <span className="kraft-tag px-2 py-1 font-mono text-[11px] leading-none font-semibold tracking-wide">{productCode(product.slug)}</span>
        </span>

        {soldOut ? (
          <span className="absolute bottom-3 left-3 rounded-full bg-ink px-3 py-1 text-xs font-bold text-white">售完・等補貨</span>
        ) : off > 0 ? (
          <span className="absolute bottom-3 left-3 rounded-full bg-mark px-3 py-1 font-mono text-xs font-semibold text-white">−{off}%</span>
        ) : null}
      </div>

      {/* 文字 */}
      <div className="mt-3.5 flex items-start justify-between gap-3 px-0.5">
        <div className="min-w-0">
          <p className="truncate text-[15px] leading-snug font-bold">{product.name}</p>
          <div className="mt-2 flex gap-1.5" aria-label={`${colors.length} 種顏色`}>
            {colors.map(([name, hex]) => (
              <span key={name} title={name} className={cn("h-3 w-3 rounded-full ring-1 ring-offset-1", dark ? "ring-white/30 ring-offset-ink" : "ring-ink/20 ring-offset-paper")} style={{ background: hex }} />
            ))}
          </div>
        </div>
        <div className="shrink-0 text-right font-mono tabular-nums">
          {product.salePrice && !soldOut ? (
            <>
              <p className={cn("text-[15px] leading-snug font-semibold", dark ? "text-neon" : "text-mark")}>{formatPrice(product.salePrice)}</p>
              <p className={cn("mt-1 text-xs line-through", dark ? "text-white/55" : "text-muted")}>{formatPrice(product.price)}</p>
            </>
          ) : (
            <p className="text-[15px] leading-snug font-semibold">{formatPrice(product.price)}</p>
          )}
        </div>
      </div>
    </Link>
  );
}

// 商品格：手機 2 欄，大螢幕 3～4 欄
export function Rail({ children, className, cols = "lg:grid-cols-4" }: { children: React.ReactNode; className?: string; cols?: string }) {
  return <div className={cn("grid grid-cols-2 gap-x-4 gap-y-10 md:gap-x-6 md:gap-y-14", cols, className)}>{children}</div>;
}
