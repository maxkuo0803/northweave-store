"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { addToCartAction } from "@/app/cart/actions";
import { cn } from "@/lib/utils";

type Variant = { id: string; color: string; colorHex: string; size: string; stock: number };
type Image = { url: string; alt: string; color: string | null };

// 紅色麥克筆圈：選中的尺寸被圈起來
function MarkerCircle() {
  return (
    <svg aria-hidden viewBox="0 0 64 44" preserveAspectRatio="none" className="pointer-events-none absolute -inset-2 h-[calc(100%+16px)] w-[calc(100%+16px)] text-mark">
      <path
        d="M8 22 C6 8 40 2 54 9 C64 15 60 34 42 39 C24 44 4 38 6 22 C7 14 20 7 34 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        pathLength={1}
        className="[stroke-dasharray:1] [stroke-dashoffset:1] motion-safe:animate-[draw_.35s_ease-out_forwards] motion-reduce:[stroke-dashoffset:0]"
      />
    </svg>
  );
}

export function VariantPicker({
  variants,
  images,
  returnTo,
  code,
  name,
  price,
  salePrice,
  children,
  footer,
}: {
  variants: Variant[];
  images: Image[];
  returnTo: string;
  code: string;
  name: string;
  price: number;
  salePrice: number | null;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const colors = useMemo(() => [...new Map(variants.map((v) => [v.color, v.colorHex])).entries()], [variants]);
  const sizes = useMemo(() => [...new Set(variants.map((v) => v.size))], [variants]);
  const [color, setColor] = useState(colors[0]?.[0]);
  const [size, setSize] = useState<string | undefined>(sizes.length === 1 ? sizes[0] : undefined);
  const [qty, setQty] = useState(1);
  const [state, action, pending] = useActionState(addToCartAction, undefined);

  const selected = variants.find((v) => v.color === color && v.size === size);
  const image = images.find((i) => i.color === color) ?? images[0];
  const stockOf = (s: string) => variants.find((v) => v.color === color && v.size === s)?.stock ?? 0;

  return (
    <div className="grid items-start gap-10 md:grid-cols-[1.1fr_1fr]">
      {/* 左：掛在鐵桿上的這一件 */}
      <div className="relative pt-8">
        <span aria-hidden className="absolute inset-x-0 top-0 h-2.5 bg-rail shadow-[0_3px_0_rgb(0_0_0/.22)]" />
        <svg aria-hidden viewBox="0 0 24 34" className="absolute top-0 left-1/2 h-11 w-7 -translate-x-1/2 text-rail">
          <path d="M12 0 V10 Q12 17 6 17 Q1 17 1 12" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
          <path d="M12 10 V34" stroke="currentColor" strokeWidth="2" />
        </svg>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img key={image?.url} src={image?.url} alt={image?.alt} className="mx-auto aspect-square w-[86%]" />
        <div className="-mt-[18%] flex justify-center">
          <div className="kraft-tag swing-tag w-64 px-4 pt-6 pb-4" style={{ "--tilt": "-3deg" } as React.CSSProperties}>
            <span aria-hidden className="absolute -top-3.5 left-1/2 h-8 w-5 -translate-x-1/2 rounded-[2px] bg-[#d9b989] shadow-[inset_0_0_0_1.5px_#9c7a4c,0_2px_3px_rgb(0_0_0/.3)]" />
            <p className="font-marker text-base leading-none">{code}</p>
            <p className="mt-2 text-sm font-bold">{name}</p>
            <p className="mt-1 text-sm font-bold">{color}{size && ` / ${size}`}</p>
            {salePrice ? (
              <p className="mt-1 flex items-baseline gap-2">
                <span className="font-marker text-4xl leading-none text-mark">{salePrice}</span>
                <span className="text-sm font-bold line-through decoration-2">{price}</span>
              </p>
            ) : (
              <p className="mt-1 font-marker text-4xl leading-none">{price}</p>
            )}
          </div>
        </div>
      </div>

      {/* 右：白色告示紙，挑顏色、尺寸、加入購物車 */}
      <div id="picker" className="card space-y-6 p-6 md:p-7">
        {children}
        <div>
          <p className="mb-2 text-sm font-bold">顏色：{color}</p>
          <div className="flex flex-wrap gap-2.5">
            {colors.map(([n, hex]) => (
              <button
                key={n}
                type="button"
                title={n}
                aria-label={n}
                aria-pressed={color === n}
                onClick={() => setColor(n)}
                className={cn("h-10 w-10 rounded-sm ring-1 ring-ink/25 transition-transform hover:-translate-y-0.5", color === n && "ring-2 ring-ink ring-offset-2")}
                style={{ background: hex }}
              />
            ))}
          </div>
        </div>
        <div>
          <div className="mb-2 flex justify-between text-sm">
            <p className="font-bold">尺寸：{size ?? "請選一個"}</p>
            <Link href="#size-guide" className="text-muted underline">尺寸表</Link>
          </div>
          <div className="flex flex-wrap gap-3">
            {sizes.map((s) => {
              const stock = stockOf(s);
              const on = size === s;
              return (
                <button
                  key={s}
                  type="button"
                  disabled={stock === 0}
                  onClick={() => setSize(s)}
                  aria-pressed={on}
                  aria-label={stock === 0 ? `${s} 售完` : s}
                  className={cn(
                    "relative min-w-13 rounded-sm px-3 py-2 text-base font-black transition-transform",
                    stock === 0
                      ? "cursor-not-allowed bg-[#c9cdcf] text-ink/45 line-through decoration-2"
                      : "kraft-tag hover:-translate-y-0.5",
                  )}
                >
                  {s}
                  {on && <MarkerCircle />}
                </button>
              );
            })}
          </div>
          {selected && selected.stock > 0 && selected.stock <= 4 && <p className="mt-3 text-sm font-bold text-mark">這個尺寸只剩 {selected.stock} 件</p>}
        </div>
        <form action={action} className="flex gap-3">
          <input type="hidden" name="variantId" value={selected?.id ?? ""} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <select name="quantity" value={qty} onChange={(e) => setQty(Number(e.target.value))} className="input w-20" aria-label="數量">
            {Array.from({ length: Math.min(10, Math.max(1, selected?.stock ?? 1)) }, (_, i) => i + 1).map((n) => <option key={n}>{n}</option>)}
          </select>
          <button className="btn-mark flex-1 text-base" disabled={pending || !selected || selected.stock === 0}>
            {pending ? "加入中…" : !size ? "先選尺寸" : selected?.stock === 0 ? "這個尺寸售完了" : "加入購物車"}
          </button>
        </form>
        <div aria-live="polite">
          {state?.error && <p className="text-sm font-bold text-bad">{state.error}</p>}
          {state?.ok && (
            <p className="neon-card inline-block px-3 py-2 text-sm font-bold">
              {state.ok}　<Link href="/cart" className="underline decoration-2">去結帳</Link>
            </p>
          )}
        </div>
        {footer}
      </div>
    </div>
  );
}
