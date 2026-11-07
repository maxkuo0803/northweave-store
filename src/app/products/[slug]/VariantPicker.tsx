"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { addToCartAction } from "@/app/cart/actions";
import { cn } from "@/lib/utils";

type Variant = { id: string; color: string; colorHex: string; size: string; stock: number };
type Image = { url: string; alt: string; color: string | null };

export function VariantPicker({ variants, images, returnTo, children, footer }: { variants: Variant[]; images: Image[]; returnTo: string; children?: React.ReactNode; footer?: React.ReactNode }) {
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
    <div className="grid gap-8 md:grid-cols-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image?.url} alt={image?.alt} className="aspect-square w-full rounded-2xl bg-sand" />
      <div id="picker" className="space-y-6 md:order-none">
        {children}
        <div>
          <p className="mb-2 text-sm">顏色：<span className="font-medium">{color}</span></p>
          <div className="flex gap-2">
            {colors.map(([name, hex]) => (
              <button key={name} type="button" title={name} aria-label={name} aria-pressed={color === name} onClick={() => setColor(name)}
                className={cn("h-9 w-9 rounded-full border", color === name ? "ring-2 ring-brand ring-offset-2" : "border-ink/15")} style={{ background: hex }} />
            ))}
          </div>
        </div>
        <div>
          <div className="mb-2 flex justify-between text-sm">
            <p>尺寸：<span className="font-medium">{size ?? "請選擇"}</span></p>
            <Link href="#size-guide" className="text-muted underline">尺寸表</Link>
          </div>
          <div className="flex flex-wrap gap-2">
            {sizes.map((s) => {
              const stock = stockOf(s);
              return (
                <button key={s} type="button" disabled={stock === 0} onClick={() => setSize(s)} aria-pressed={size === s}
                  className={cn("min-w-12 rounded-lg border px-3 py-2 text-sm", size === s ? "border-brand bg-brand text-white" : "border-line bg-card", stock === 0 && "cursor-not-allowed text-muted line-through opacity-50")}>
                  {s}
                </button>
              );
            })}
          </div>
          {selected && selected.stock > 0 && selected.stock <= 4 && <p className="mt-2 text-sm text-accent">只剩 {selected.stock} 件，要買要快！</p>}
        </div>
        <form action={action} className="flex gap-3">
          <input type="hidden" name="variantId" value={selected?.id ?? ""} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <select name="quantity" value={qty} onChange={(e) => setQty(Number(e.target.value))} className="input w-20" aria-label="數量">
            {Array.from({ length: Math.min(10, Math.max(1, selected?.stock ?? 1)) }, (_, i) => i + 1).map((n) => <option key={n}>{n}</option>)}
          </select>
          <button className="btn-primary flex-1" disabled={pending || !selected || selected.stock === 0}>
            {pending ? "加入中…" : !size ? "請選擇尺寸" : selected?.stock === 0 ? "已售完" : "加入購物車"}
          </button>
        </form>
        {state?.error && <p className="text-sm text-bad">{state.error}</p>}
        {state?.ok && (
          <p className="text-sm text-ok">
            {state.ok}　<Link href="/cart" className="underline">前往結帳 →</Link>
          </p>
        )}
        {footer}
      </div>
    </div>
  );
}
