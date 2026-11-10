"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { cn } from "@/lib/utils";

// 對話裡的各種小零件：一則訊息、商品卡片、顏色尺寸選擇器、連結、圖示。
// 小織的對話是「Siri 式」：深色底、大字，不用聊天泡泡；你說的話靠右、淡一點，小織說的話靠左、大一點。

type Variant = { id: string; color: string; hex: string; size: string; soldOut: boolean };
export type Card = { code: string; name: string; price: number; originalPrice?: number; onSale?: boolean; url: string; image: string; pick?: boolean; variants?: Variant[] };
type Choice = { label: string; reply: string };
type Attachments = { products?: Card[]; choices?: Choice[]; links?: { label: string; href: string }[]; refresh?: boolean };
export type Msg = { id: string; role: "CUSTOMER" | "AI" | "STAFF" | "SYSTEM"; content: string; attachments?: Attachments | null; createdAt: string };
export const CART_NOTE = "（已用按鈕加入購物車）";

// size：stage = 首頁大舞台（字更大、卡片更大）；sheet = 其他頁面的對話框
export type Size = "stage" | "sheet";

type TurnProps = { m: Msg; size: Size; siteOrigin: string; onAsk: (text: string) => void; busy: boolean; isLatest: boolean; onAdded: (note: Msg) => void };

export function Turn({ m, size, siteOrigin, onAsk, busy, isLatest, onAdded }: TurnProps) {
  const big = size === "stage";
  if (m.role === "SYSTEM") return <p className="text-center text-xs font-bold text-white/55">{m.content}</p>;
  // 用選擇器加入購物車的紀錄：小小一行
  if (m.role === "CUSTOMER" && m.content.startsWith(CART_NOTE)) {
    return (
      <p className="flex items-center justify-end gap-1.5 text-sm font-bold text-neon">
        <CheckIcon className="h-4 w-4" />
        已加入購物車：{m.content.slice(CART_NOTE.length)}
      </p>
    );
  }
  // 顧客說的話：靠右、淡色，像 Siri 顯示「你剛剛說的」
  if (m.role === "CUSTOMER") {
    return (
      <p className={cn("ml-auto max-w-[85%] text-right leading-snug break-words whitespace-pre-wrap text-white/60", big ? "text-lg md:text-xl" : "text-base")}>
        {m.content}
      </p>
    );
  }
  const a = m.attachments;
  return (
    <div className="space-y-3">
      {m.role === "STAFF" && <span className="inline-block rounded-full bg-neon px-2 py-0.5 text-[11px] font-black text-ink">真人客服</span>}
      <p className={cn("max-w-[42em] leading-relaxed break-words whitespace-pre-wrap text-white", big ? "text-[19px] md:text-[22px]" : "text-[16px]")}>
        <Linkify text={m.content} siteOrigin={siteOrigin} />
      </p>
      {a?.products && a.products.length > 0 && <ProductCards products={a.products} onAdded={onAdded} size={size} />}
      {/* 選項按鈕：只在最新一則顯示，避免按到舊的選項 */}
      {isLatest && a?.choices && a.choices.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {a.choices.map((c, i) => (
            <button
              key={c.label}
              onClick={() => onAsk(c.reply)}
              disabled={busy}
              className={cn(
                "min-h-11 cursor-pointer rounded-full px-4 text-sm font-bold transition-colors disabled:opacity-50",
                i === 0 ? "bg-white text-ink hover:bg-neon" : "border border-white/25 text-white hover:border-white",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
      {a?.links && a.links.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {a.links.map((l) => (
            <Link key={l.href} href={l.href} className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-bold text-ink hover:bg-neon">
              {l.label}
              <ArrowIcon className="h-4 w-4" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// 商品卡片：橫向一排，像店員把衣服一件件拿到你面前
// - 按「加入購物車」就在卡片上展開顏色 / 尺寸選擇器（不用再問 AI）
// - pick = true（AI 要顧客選規格）：一出現就是展開的選擇器
function ProductCards({ products, onAdded, size }: { products: Card[]; onAdded: (note: Msg) => void; size: Size }) {
  const [openCodes, setOpenCodes] = useState(() => new Set(products.filter((p) => p.pick).map((p) => p.code)));
  const open = products.filter((p) => openCodes.has(p.code) && p.variants?.length);
  const rest = products.filter((p) => !open.includes(p));
  const big = size === "stage";
  const toggle = (code: string, on: boolean) =>
    setOpenCodes((s) => {
      const n = new Set(s);
      if (on) n.add(code);
      else n.delete(code);
      return n;
    });
  return (
    <div className="space-y-2">
      {open.map((p) => (
        <VariantPicker key={p.code} p={p} onAdded={onAdded} onClose={() => toggle(p.code, false)} />
      ))}
      {rest.length > 0 && (
        <ul className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:thin]" aria-label="小織推薦的商品">
          {rest.map((p) => (
            <li key={p.code} className={cn("shrink-0 snap-start overflow-hidden rounded-card bg-card text-ink", big ? "w-48 md:w-56" : "w-40")}>
              <Link href={p.url} className="group block">
                <div className="pegboard-soft relative px-3 pt-4 pb-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.image} alt={p.name} loading="lazy" className={cn("mx-auto object-contain drop-shadow transition-transform duration-300 group-hover:-translate-y-1", big ? "h-36 w-36 md:h-40 md:w-40" : "h-28 w-28")} />
                  {p.onSale && <span className="absolute top-2.5 left-2.5 rounded-full bg-neon px-2 text-[11px] font-black">特價</span>}
                </div>
                <div className="px-3 pt-2">
                  <p className="font-mono text-[11px] text-muted">{p.code}</p>
                  <p className="line-clamp-2 min-h-[2.6em] text-sm leading-tight font-bold group-hover:underline">{p.name}</p>
                  <Price p={p} />
                </div>
              </Link>
              {p.variants?.length ? (
                <button onClick={() => toggle(p.code, true)} className="m-3 mt-2 min-h-10 w-[calc(100%-1.5rem)] cursor-pointer rounded-full border border-ink/25 text-xs font-bold hover:border-ink">
                  加入購物車
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Price({ p }: { p: Card }) {
  return (
    <p className="mt-0.5 flex items-baseline gap-1.5">
      <span className="font-mono text-base tabular-nums">{p.price.toLocaleString()}</span>
      {p.originalPrice && <span className="font-mono text-[11px] text-muted line-through">{p.originalPrice.toLocaleString()}</span>}
    </p>
  );
}

// 顏色 / 尺寸選擇器：選色塊 → 選尺寸 → 加入購物車（售完的尺寸是灰色、畫刪除線）
function VariantPicker({ p, onAdded, onClose }: { p: Card; onAdded: (note: Msg) => void; onClose: () => void }) {
  const variants = p.variants ?? [];
  const colors = [...new Map(variants.map((v) => [v.color, v.hex])).entries()];
  const colorSoldOut = (c: string) => variants.filter((v) => v.color === c).every((v) => v.soldOut);
  const [color, setColor] = useState(() => colors.find(([c]) => !colorSoldOut(c))?.[0] ?? null);
  const sizes = variants.filter((v) => v.color === color);
  const [size, setSize] = useState<string | null>(() => {
    const avail = variants.filter((v) => v.color === color && !v.soldOut);
    return avail.length === 1 ? avail[0].size : null; // 只有一個尺寸（例如配件 F）就自動選好
  });
  const [state, setState] = useState<{ busy?: boolean; done?: string; error?: string; login?: boolean }>({});
  const chosen = variants.find((v) => v.color === color && v.size === size && !v.soldOut);

  async function add() {
    if (!chosen) return;
    setState({ busy: true });
    const res = await fetch("/api/chat/cart", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ variantId: chosen.id, quantity: 1 }) }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) return setState({ error: data.error ?? "加入失敗，請再試一次", login: !!data.login });
    setState({ done: `${chosen.color} / ${chosen.size}` });
    onAdded({ ...data.note, attachments: null });
  }

  return (
    <div className="flex max-w-md gap-3 rounded-card bg-card p-3 text-ink">
      <Link href={p.url} className="pegboard-soft shrink-0 rounded-sm p-1.5" aria-label={`查看 ${p.name}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={p.image} alt="" className="h-24 w-24 object-contain drop-shadow" />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-1">
          <div className="min-w-0">
            <p className="font-mono text-[11px] text-muted">{p.code}</p>
            <p className="truncate text-sm leading-tight font-bold">{p.name}</p>
          </div>
          <button onClick={onClose} aria-label="收起選擇器" className="-mt-1.5 -mr-1.5 grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full text-muted hover:bg-ink/5 hover:text-ink">
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
        <Price p={p} />

        <div className="mt-2 flex flex-wrap items-center gap-2" role="radiogroup" aria-label="顏色">
          {colors.map(([c, hex]) => (
            <button
              key={c}
              role="radio"
              aria-checked={color === c}
              aria-label={`${c}${colorSoldOut(c) ? "（售完）" : ""}`}
              title={c}
              disabled={colorSoldOut(c)}
              onClick={() => { setColor(c); setSize(null); setState({}); }}
              className={cn("h-7 w-7 cursor-pointer rounded-full border border-black/15 ring-offset-2 ring-offset-card disabled:cursor-not-allowed disabled:opacity-30", color === c && "ring-2 ring-ink")}
              style={{ backgroundColor: hex }}
            />
          ))}
          {color && <span className="text-xs text-muted">{color}</span>}
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="尺寸">
          {sizes.map((v) => (
            <button
              key={v.id}
              role="radio"
              aria-checked={size === v.size}
              disabled={v.soldOut}
              onClick={() => { setSize(v.size); setState({}); }}
              className={cn(
                "h-9 min-w-10 cursor-pointer rounded-full border px-2.5 text-xs font-bold",
                size === v.size ? "border-ink bg-ink text-white" : "border-ink/25 hover:border-ink",
                v.soldOut && "cursor-not-allowed border-line text-muted line-through",
              )}
            >
              {v.size}
            </button>
          ))}
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <button onClick={add} disabled={!chosen || state.busy} className="h-10 shrink-0 cursor-pointer rounded-full bg-ink px-4 text-xs font-bold whitespace-nowrap text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-40">
            {state.busy ? "加入中…" : chosen ? "加入購物車" : "請選顏色和尺寸"}
          </button>
          {state.done && <span className="text-xs font-bold text-ok">已加入 {state.done}</span>}
          {state.error && (
            <span className="text-xs font-bold text-bad">
              {state.error}
              {state.login && <> ・<Link href={`/login?next=${encodeURIComponent(p.url)}`} className="underline">登入</Link></>}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// 連結文字：商品連結顯示編號（查看 NW035），一次列好幾個連結時才分得出來
function linkLabel(href: string) {
  const code = href.match(/^\/products\/(nw\d+)/i)?.[1];
  if (code) return `查看 ${code.toUpperCase()}`;
  if (href.startsWith("/account/returns/")) return "查看退換貨進度";
  if (href.startsWith("/account/orders/")) return "查看訂單";
  if (href.startsWith("/account")) return "前往會員中心";
  return "開啟連結";
}

// 把網址變成可以點的連結（React 會自動跳脫文字，不會有 XSS）；站內網址改成相對路徑
export function Linkify({ text, siteOrigin }: { text: string; siteOrigin: string }) {
  const parts = text.split(/(https?:\/\/[^\s）)」]+)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (!/^https?:\/\//.test(p)) return <Fragment key={i}>{p}</Fragment>;
        let href = p;
        try {
          const u = new URL(p);
          if (u.host === window.location.host || u.origin === siteOrigin) href = u.pathname + u.search;
          else return <Fragment key={i}>{p}</Fragment>; // 外部網址不做成連結
        } catch {
          return <Fragment key={i}>{p}</Fragment>;
        }
        return <Link key={i} href={href} className="font-bold underline decoration-neon decoration-2 hover:text-neon">{linkLabel(href)}</Link>;
      })}
    </>
  );
}

// ───── 圖示（全部是 SVG，不用 emoji） ─────
type IconProps = { className?: string };
export function CheckIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 8.5l3 3 7-7" />
    </svg>
  );
}
export function ArrowIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}
export function CloseIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
export function MicIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
    </svg>
  );
}
export function SendIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 19V5M6 11l6-6 6 6" />
    </svg>
  );
}
export function StopIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" />
    </svg>
  );
}
export function SpeakerIcon({ className, off }: IconProps & { off?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
      {off ? <path d="M16 9.5l5 5M21 9.5l-5 5" /> : <path d="M16 9a4.5 4.5 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" />}
    </svg>
  );
}
