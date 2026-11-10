"use client";

import { useRef } from "react";
import Link from "next/link";
import { Hook } from "@/components/ProductCard";
import { formatPrice } from "@/lib/store-config";
import { cn } from "@/lib/utils";

export type HeroItem = { slug: string; code: string; name: string; price: number; salePrice: number | null; image: string; alt: string };

// 每件衣服的位置、大小、晃動節奏都不同，看起來比較自然（固定值，不會每次重整都變）
const LAYOUT = [
  { w: "w-[36%]", top: "mt-0", depth: 14, delay: "0s", dur: "6.5s" },
  { w: "w-[42%]", top: "mt-8", depth: 26, delay: "-2.2s", dur: "7.5s" },
  { w: "w-[34%]", top: "mt-3", depth: 10, delay: "-4.1s", dur: "6s" },
];

/**
 * 首頁主視覺：一支鐵桿上掛三件衣服，輕輕晃動。
 * 滑鼠移動時，衣服依「遠近」不同的幅度跟著移動（視差），像真的站在攤位前面。
 * 使用者設定「減少動態效果」時，不晃也不跟著滑鼠動。
 */
export function HeroRail({ items }: { items: HeroItem[] }) {
  const ref = useRef<HTMLDivElement>(null);

  function onMove(e: React.PointerEvent) {
    const el = ref.current;
    if (!el || e.pointerType !== "mouse" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--px", String((e.clientX - r.left) / r.width - 0.5));
    el.style.setProperty("--py", String((e.clientY - r.top) / r.height - 0.5));
  }
  function onLeave() {
    ref.current?.style.setProperty("--px", "0");
    ref.current?.style.setProperty("--py", "0");
  }

  return (
    <div ref={ref} onPointerMove={onMove} onPointerLeave={onLeave} className="relative pt-3" style={{ "--px": 0, "--py": 0 } as React.CSSProperties}>
      {/* 鐵桿：兩端有固定座 */}
      <div aria-hidden className="absolute inset-x-[-4%] top-0 h-2 rounded-full bg-rail shadow-[0_3px_0_rgb(0_0_0/.18),inset_0_1px_0_rgb(255_255_255/.25)]">
        <span className="absolute -top-2 left-3 h-6 w-2 rounded-sm bg-rail" />
        <span className="absolute -top-2 right-3 h-6 w-2 rounded-sm bg-rail" />
      </div>
      <div className="flex items-start justify-center gap-[2%]">
        {items.slice(0, 3).map((it, i) => {
          const l = LAYOUT[i];
          return (
            <Link
              key={it.slug}
              href={`/products/${it.slug}`}
              aria-label={`${it.name}，${formatPrice(it.salePrice ?? it.price)}`}
              className={cn("group relative block", l.w)}
              style={{
                transform: `translate3d(calc(var(--px) * ${l.depth}px), calc(var(--py) * ${l.depth * 0.5}px), 0)`,
                transition: "transform 600ms cubic-bezier(0.22, 1, 0.36, 1)",
              }}
            >
              <div className="sway" style={{ animationDelay: l.delay, animationDuration: l.dur }}>
                <Hook className="mx-auto -mt-1 h-10 w-6" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={it.image}
                  alt={it.alt}
                  className={cn("-mt-4 aspect-square w-full drop-shadow-[0_24px_24px_rgb(0_0_0/.18)] transition-transform duration-500 group-hover:-translate-y-2", l.top)}
                />
                {/* 吊牌：編號 + 價錢 */}
                <div className="-mt-[16%] flex justify-center">
                  <span className="kraft-tag px-3 py-2 text-center transition-transform duration-300 group-hover:scale-105">
                    <span className="block font-mono text-[10px] font-semibold tracking-widest opacity-75">{it.code}</span>
                    <span className={cn("block font-mono text-sm font-semibold tabular-nums", it.salePrice != null && "text-mark")}>{formatPrice(it.salePrice ?? it.price)}</span>
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
