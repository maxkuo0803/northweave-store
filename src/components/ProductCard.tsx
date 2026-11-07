import Link from "next/link";
import type { ProductCardData } from "@/lib/catalog";
import { Price } from "./Price";

export function ProductCard({ product }: { product: ProductCardData }) {
  const colors = [...new Map(product.variants.map((v) => [v.color, v.colorHex])).entries()];
  const soldOut = product.variants.every((v) => v.stock === 0);
  const img = product.images[0];
  return (
    <Link href={`/products/${product.slug}`} className="group block">
      <div className="relative overflow-hidden rounded-2xl bg-sand">
        {/* SVG 示意圖用一般 <img>；換成真實照片時可改用 next/image */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={img?.url} alt={img?.alt ?? product.name} className="aspect-square w-full transition duration-300 group-hover:scale-105" loading="lazy" />
        {product.salePrice && <span className="badge absolute top-3 left-3 bg-accent text-white">特價</span>}
        {soldOut && <span className="badge absolute top-3 right-3 bg-ink text-white">已售完</span>}
      </div>
      <div className="mt-3 space-y-1">
        <p className="text-sm font-medium group-hover:text-brand">{product.name}</p>
        <Price price={product.price} salePrice={product.salePrice} />
        <div className="flex gap-1">
          {colors.map(([name, hex]) => (
            <span key={name} title={name} className="h-3 w-3 rounded-full border border-ink/15" style={{ background: hex }} />
          ))}
        </div>
      </div>
    </Link>
  );
}
