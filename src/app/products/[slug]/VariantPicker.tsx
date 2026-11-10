"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { addToCartAction } from "@/app/cart/actions";
import { Hook } from "@/components/ProductCard";
import { PAYMENT_METHOD_LABEL, RETURN_WINDOW_DAYS, SHIPPING, formatPrice } from "@/lib/store-config";
import { cn } from "@/lib/utils";
import { AskChips } from "@/components/chat/AskChips";
import { hintXiaozhi } from "@/components/chat/ask";

type Variant = { id: string; color: string; colorHex: string; size: string; stock: number };
type Image = { url: string; alt: string; color: string | null };

// 小圖示：勾勾
function Check() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-ok">
      <path d="M3 8.5 L6.5 12 L13 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function VariantPicker({
  variants,
  images,
  returnTo,
  code,
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
  // 顧客在尺寸之間點來點去（換了 3 次以上）或打開尺寸表 → 小織走過來問一句（一件商品只問一次）
  const sizeClicks = useRef(0);
  const hesitate = () =>
    hintXiaozhi({
      key: `size:${code}`,
      message: "尺寸拿不定主意嗎？告訴我身高體重，我幫你挑。",
      short: "尺寸拿不定？我幫你挑",
      askLabel: "幫我挑尺寸",
      askText: `幫我挑 ${code} 的尺寸`,
      source: "size-hesitation",
    });
  const [state, action, pending] = useActionState(addToCartAction, undefined);

  const selected = variants.find((v) => v.color === color && v.size === size);
  const image = images.find((i) => i.color === color) ?? images[0];
  const stockOf = (s: string) => variants.find((v) => v.color === color && v.size === s)?.stock ?? 0;
  const maxQty = Math.min(10, Math.max(1, selected?.stock ?? 1));
  const off = salePrice ? Math.round((1 - salePrice / price) * 100) : 0;

  return (
    <div className="grid items-start gap-10 md:grid-cols-[1.15fr_1fr] lg:gap-16">
      {/* 左：商品台（捲動時固定） */}
      <div className="md:sticky md:top-32">
        <div className="pegboard-soft relative aspect-[4/5] overflow-hidden rounded-card">
          <span aria-hidden className="absolute inset-x-0 top-[8%] h-1.5 bg-rail/90 shadow-[0_2px_0_rgb(0_0_0/.12)]" />
          <div className="absolute inset-x-0 top-[8%] flex flex-col items-center">
            <Hook className="-mt-[3px] h-11 w-7" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img key={image?.url} src={image?.url} alt={image?.alt} className="-mt-4 aspect-square w-[82%] motion-safe:animate-[fade-in_.5s_ease-out]" />
          </div>
          <span className="absolute top-[calc(8%+6px)] right-[8%] flex flex-col items-center">
            <span aria-hidden className="h-4 w-px bg-rail/60" />
            <span className="kraft-tag px-2.5 py-1.5 font-mono text-xs leading-none font-semibold tracking-wide">{code}</span>
          </span>
          {off > 0 && <span className="absolute bottom-4 left-4 rounded-full bg-mark px-3 py-1 font-mono text-sm font-semibold text-white">−{off}%</span>}
        </div>
        {/* 各顏色的小圖：點了直接換顏色 */}
        {colors.length > 1 && (
          <div className="mt-3 grid grid-cols-5 gap-2 sm:grid-cols-6">
            {colors.map(([n]) => {
              const img = images.find((i) => i.color === n) ?? images[0];
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setColor(n)}
                  aria-label={`看 ${n}`}
                  className={cn("pegboard-soft aspect-square overflow-hidden rounded-sm p-1 ring-offset-2 ring-offset-paper transition-shadow", color === n ? "ring-2 ring-ink" : "hover:ring-1 hover:ring-ink/30")}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img?.url} alt="" className="h-full w-full" />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 右：品名、價錢、選顏色尺寸、加入購物車 */}
      <div id="picker" className="space-y-8">
        {children}

        <div className="flex items-baseline gap-3 font-mono tabular-nums">
          {salePrice ? (
            <>
              <span className="text-3xl font-semibold text-mark">{formatPrice(salePrice)}</span>
              <span className="text-base text-muted line-through">{formatPrice(price)}</span>
            </>
          ) : (
            <span className="text-3xl font-semibold">{formatPrice(price)}</span>
          )}
        </div>

        <div className="border-t border-line pt-7">
          <p className="mb-3 text-sm">
            <span className="font-bold">顏色</span>
            <span className="ml-2 text-muted">{color}</span>
          </p>
          <div className="flex flex-wrap gap-3">
            {colors.map(([n, hex]) => (
              <button
                key={n}
                type="button"
                title={n}
                aria-label={n}
                aria-pressed={color === n}
                onClick={() => setColor(n)}
                className={cn(
                  "h-10 w-10 rounded-full ring-1 ring-ink/20 ring-offset-[3px] ring-offset-paper transition-transform hover:scale-110",
                  color === n && "ring-2 ring-ink",
                )}
                style={{ background: hex }}
              />
            ))}
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-baseline justify-between text-sm">
            <p>
              <span className="font-bold">尺寸</span>
              <span className="ml-2 text-muted">{size ?? "請選一個"}</span>
            </p>
            <Link href="#size-guide" onClick={hesitate} className="font-bold underline decoration-ink/30 underline-offset-4 hover:decoration-ink">
              尺寸表
            </Link>
          </div>
          <div className="flex flex-wrap gap-2.5">
            {sizes.map((s) => {
              const stock = stockOf(s);
              const on = size === s;
              return (
                <button
                  key={s}
                  type="button"
                  disabled={stock === 0}
                  onClick={() => {
                    setSize(s);
                    if (++sizeClicks.current >= 3) hesitate();
                  }}
                  aria-pressed={on}
                  aria-label={stock === 0 ? `${s} 售完` : s}
                  className={cn(
                    "h-12 min-w-14 rounded-sm border px-4 font-mono text-[15px] font-semibold transition-colors",
                    stock === 0
                      ? "cursor-not-allowed border-dashed border-ink/20 text-ink/35 line-through"
                      : on
                        ? "border-ink bg-ink text-white"
                        : "border-ink/20 bg-white/60 hover:border-ink",
                  )}
                >
                  {s}
                </button>
              );
            })}
          </div>
          {selected && selected.stock > 0 && selected.stock <= 4 && <p className="mt-3 text-sm font-bold text-warn">這個尺寸只剩 {selected.stock} 件</p>}
          {/* 店員就站在尺寸旁邊：不確定就問 */}
          <AskChips
            className="mt-4"
            source="product-chip"
            questions={[
              { label: "我該穿哪個尺寸？", text: `幫我挑 ${code} 的尺寸` },
              { label: "怎麼搭？", text: `${code} 怎麼搭配？` },
              { label: "會不會透？好洗嗎？", text: `${code} 的材質會不會透？好不好洗？` },
            ]}
          />
        </div>

        <form action={action} className="flex gap-3">
          <input type="hidden" name="variantId" value={selected?.id ?? ""} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <input type="hidden" name="quantity" value={Math.min(qty, maxQty)} />
          {/* 數量：− 1 + */}
          <div className="flex h-14 items-center rounded-full border border-ink/20 bg-white/60" role="group" aria-label="數量">
            <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} className="grid h-full w-11 place-items-center rounded-l-full text-lg hover:bg-ink/5" aria-label="減少數量">−</button>
            <span className="w-6 text-center font-mono font-semibold tabular-nums" aria-live="polite">{Math.min(qty, maxQty)}</span>
            <button type="button" onClick={() => setQty((q) => Math.min(maxQty, q + 1))} className="grid h-full w-11 place-items-center rounded-r-full text-lg hover:bg-ink/5" aria-label="增加數量">+</button>
          </div>
          <button className="btn-mark h-14 flex-1 text-base" disabled={pending || !selected || selected.stock === 0}>
            {pending ? "加入中…" : !size ? "先選尺寸" : selected?.stock === 0 ? "這個尺寸售完了" : "加入購物車"}
          </button>
        </form>

        <div aria-live="polite">
          {state?.error && <p className="rounded-sm bg-bad/10 px-4 py-3 text-sm font-bold text-bad">{state.error}</p>}
          {state?.ok && (
            <p className="flex flex-wrap items-center justify-between gap-2 rounded-sm bg-ok/10 px-4 py-3 text-sm font-bold text-ok">
              {state.ok}
              <Link href="/cart" className="btn-primary h-9 px-4 text-sm">去結帳</Link>
            </p>
          )}
        </div>

        {/* 讓人安心的三件事 */}
        <ul className="grid gap-2.5 text-sm text-ink/80">
          <li className="flex items-center gap-2.5"><Check />滿 NT${SHIPPING.freeThreshold.toLocaleString()} 免運，超商取貨 NT${SHIPPING.fee.CVS}</li>
          <li className="flex items-center gap-2.5"><Check />收到後 {RETURN_WINDOW_DAYS} 天內可退換，尺寸不合第一次換貨免運</li>
          <li className="flex items-center gap-2.5"><Check />{Object.values(PAYMENT_METHOD_LABEL).join("、")}</li>
        </ul>

        {footer}
      </div>
    </div>
  );
}
