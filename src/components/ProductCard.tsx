import Link from "next/link";
import type { ProductCardData } from "@/lib/catalog";
import { formatPrice } from "@/lib/store-config";
import { cn } from "@/lib/utils";

// 每件吊牌歪的角度不同，看起來像真的手掛上去（用固定順序，畫面不會每次重整都亂跳）
const TILTS = [-4, 3, -2, 5, -3, 2, -5, 4];

export function productCode(slug: string) {
  return slug.split("-")[0].toUpperCase();
}

// 一件掛在鐵桿上的衣服：掛鉤 → 衣服 → 夾著的紙箱板吊牌
export function ProductCard({ product, index = 0 }: { product: ProductCardData; index?: number }) {
  const colors = [...new Map(product.variants.map((v) => [v.color, v.colorHex])).entries()];
  const soldOut = product.variants.every((v) => v.stock === 0);
  const img = product.images[0];
  const tilt = TILTS[index % TILTS.length];

  return (
    <Link href={`/products/${product.slug}`} className="group relative block pt-6 outline-none" aria-label={`${product.name}，${formatPrice(product.salePrice ?? product.price)}${soldOut ? "，已售完" : ""}`}>
      {/* 鐵桿：每件衣服畫自己那一段，相鄰的接起來就是一整排 */}
      <span aria-hidden className="absolute -inset-x-2 top-0 h-2 bg-rail shadow-[0_3px_0_rgb(0_0_0/.22),inset_0_1px_0_rgb(255_255_255/.25)]" />
      {/* 掛鉤 */}
      <svg aria-hidden viewBox="0 0 24 34" className="absolute top-0 left-1/2 h-9 w-6 -translate-x-1/2 text-rail">
        <path d="M12 0 V10 Q12 17 6 17 Q1 17 1 12" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M12 10 V34" stroke="currentColor" strokeWidth="2" />
      </svg>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={img?.url}
        alt={img?.alt ?? product.name}
        loading="lazy"
        className={cn("mx-auto aspect-square w-[88%] transition-transform duration-500 ease-out group-hover:-translate-y-1", soldOut && "opacity-60 grayscale-[.4]")}
      />

      {/* 吊牌 */}
      <div className="-mt-[22%] flex justify-center">
        <div
          style={{ "--tilt": `${tilt}deg` } as React.CSSProperties}
          className={cn("swing-tag swing-on-hover w-[78%] max-w-52 px-3 pt-5 pb-3", soldOut ? "rounded-sm bg-[#b9bdbf] text-ink shadow-md" : "kraft-tag")}
        >
          {/* 木衣夾 */}
          <span aria-hidden className="absolute -top-3 left-1/2 h-7 w-4 -translate-x-1/2 rounded-[2px] bg-[#d9b989] shadow-[inset_0_0_0_1.5px_#9c7a4c,0_2px_3px_rgb(0_0_0/.3)]" />
          <p className="font-marker text-[13px] leading-none tracking-wide">{productCode(product.slug)}</p>
          <p className="mt-1.5 text-[13px] leading-snug font-bold">{product.name}</p>
          {soldOut ? (
            <p className="mt-1 text-lg font-black">售完・等補貨</p>
          ) : product.salePrice ? (
            <p className="mt-1 flex items-baseline gap-2">
              <span className="font-marker text-[26px] leading-none text-mark">{product.salePrice}</span>
              <span className="text-xs font-bold line-through decoration-2">{product.price}</span>
            </p>
          ) : (
            <p className="mt-1 font-marker text-[26px] leading-none">{product.price}</p>
          )}
          <div className="mt-2 flex gap-1">
            {colors.map(([name, hex]) => (
              <span key={name} title={name} className="h-2.5 w-2.5 rounded-full ring-1 ring-ink/30" style={{ background: hex }} />
            ))}
          </div>
        </div>
      </div>
      {product.salePrice && !soldOut && (
        <span className="neon-card absolute top-10 right-[6%] rotate-6 px-2 py-0.5 text-xs font-black">特價</span>
      )}
    </Link>
  );
}

// 衣架區：一排排掛起來的衣服（每一列上方自動出現鐵桿）
export function Rail({ children, className, cols = "lg:grid-cols-4" }: { children: React.ReactNode; className?: string; cols?: string }) {
  return <div className={cn("grid grid-cols-2 gap-x-4 gap-y-14 overflow-x-clip px-2", cols, className)}>{children}</div>;
}
