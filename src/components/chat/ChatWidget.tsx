"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { BotAvatar } from "./BotAvatar";

// 右下角的客服聊天視窗 + 主動推薦泡泡。
// - 打開時每 4 秒問一次有沒有新訊息（真人客服的回覆也是這樣收到）
// - 沒打開時，在商品頁 / 購物車停留一段時間，會跳出推薦泡泡（規則計算，不花 AI 費用）

// AI 回覆可以附帶：商品卡片、按鈕（例如「前往結帳」）、要不要重新整理頁面（購物車有變動）
type Card = { code: string; name: string; price: number; originalPrice?: number; onSale?: boolean; url: string; image: string };
type Attachments = { products?: Card[]; links?: { label: string; href: string }[]; refresh?: boolean };
type Msg = { id: string; role: "CUSTOMER" | "AI" | "STAFF" | "SYSTEM"; content: string; attachments?: Attachments | null; createdAt: string };
type NudgeProduct = { slug: string; code: string; name: string; price: number; onSale: boolean; image: string };
type Nudge = { message: string; products: NudgeProduct[] };

const QUICK = ["我的訂單到哪了？", "我想退換貨", "幫我推薦搭配", "運費怎麼算？"];
const NUDGE_DELAY = (path: string) => (path === "/cart" ? 5000 : path.startsWith("/products/") ? 9000 : 25000);
const MAX_NUDGES_PER_SESSION = 3;

// localStorage / sessionStorage 在無痕模式可能會丟錯，包起來
const store = {
  get: (s: Storage | undefined, k: string) => { try { return s?.getItem(k) ?? null; } catch { return null; } },
  set: (s: Storage | undefined, k: string, v: string) => { try { s?.setItem(k, v); } catch { /* 忽略 */ } },
};
const ss = () => (typeof window === "undefined" ? undefined : window.sessionStorage);
const ls = () => (typeof window === "undefined" ? undefined : window.localStorage);

// siteOrigin：AI 回覆裡的網址用的網域（BETTER_AUTH_URL），用來判斷是不是站內連結
export function ChatWidget({ siteOrigin }: { siteOrigin: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [status, setStatus] = useState("AI");
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 推薦泡泡記住是在哪一頁拿到的：換頁後自動不顯示
  const [nudgeState, setNudgeState] = useState<{ path: string; nudge: Nudge } | null>(null);
  const nudge = nudgeState?.path === pathname ? nudgeState.nudge : null;
  const setNudge = (n: null) => setNudgeState(n);
  const listRef = useRef<HTMLDivElement>(null);
  const lastAt = useRef<string | null>(null);

  const merge = useCallback((incoming: Msg[]) => {
    if (!incoming.length) return;
    setMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      const next = [...prev, ...incoming.filter((m) => !seen.has(m.id))];
      lastAt.current = next.at(-1)?.createdAt ?? lastAt.current;
      return next;
    });
  }, []);

  const poll = useCallback(async () => {
    const res = await fetch(`/api/chat${lastAt.current ? `?after=${encodeURIComponent(lastAt.current)}` : ""}`, { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as { status: string; messages: Msg[] };
    setStatus(data.status);
    merge(data.messages);
  }, [merge]);

  // 打開時載入並開始輪詢
  useEffect(() => {
    if (!open) return;
    poll();
    const t = setInterval(poll, 4000);
    return () => clearInterval(t);
  }, [open, poll]);

  // 新訊息自動捲到底
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending, open]);

  // 主動推薦泡泡
  useEffect(() => {
    if (open || pathname.startsWith("/admin") || store.get(ls(), "nw_nudge_off")) return;
    const shown = Number(store.get(ss(), "nw_nudge_count") ?? 0);
    const key = `nw_nudge:${pathname}`;
    if (shown >= MAX_NUDGES_PER_SESSION || store.get(ss(), key)) return;
    const t = setTimeout(async () => {
      const res = await fetch(`/api/chat/nudge?path=${encodeURIComponent(pathname)}`, { cache: "no-store" }).catch(() => null);
      if (!res?.ok) return;
      const data = (await res.json()) as { nudge: Nudge | null };
      if (!data.nudge) return;
      store.set(ss(), key, "1");
      store.set(ss(), "nw_nudge_count", String(shown + 1));
      setNudgeState({ path: pathname, nudge: data.nudge });
    }, NUDGE_DELAY(pathname));
    return () => clearTimeout(t);
  }, [pathname, open]);

  async function send(text: string) {
    const t = text.trim();
    if (!t || sending) return;
    setError(null);
    setInput("");
    setSending(true);
    // 先把自己的訊息顯示出來（樂觀更新），伺服器回來再換成正式的
    const temp: Msg = { id: `temp-${Date.now()}`, role: "CUSTOMER", content: t, createdAt: new Date().toISOString() };
    setMessages((m) => [...m, temp]);
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: t, path: pathname }) });
      const data = await res.json();
      setMessages((m) => m.filter((x) => x.id !== temp.id));
      if (!res.ok) {
        setError(data.error ?? "傳送失敗，請再試一次");
        setInput(t);
        return;
      }
      setStatus(data.status);
      merge(data.messages);
      // 小織幫忙加了購物車 / 下了單 → 重新整理頁面資料（右上角購物車數量、購物車頁會更新）
      if ((data.messages as Msg[]).some((m) => m.attachments?.refresh)) router.refresh();
    } catch {
      setMessages((m) => m.filter((x) => x.id !== temp.id));
      setError("網路好像斷了，請再試一次");
      setInput(t);
    } finally {
      setSending(false);
    }
  }

  if (pathname.startsWith("/admin")) return null;

  return (
    <div className="fixed right-3 bottom-3 z-50 flex flex-col items-end gap-1 print:hidden">
      {nudge && !open && (
        <NudgeCard
          nudge={nudge}
          onClose={() => setNudge(null)}
          onMute={() => { store.set(ls(), "nw_nudge_off", "1"); setNudge(null); }}
          onAsk={() => { setNudge(null); setOpen(true); send("剛剛推薦的這幾件，要怎麼搭配比較好？"); }}
        />
      )}

      {open && (
        <section
          aria-label="客服對話"
          className="card flex h-[min(560px,calc(100dvh-6rem))] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden"
        >
          <header className="flex items-center gap-3 bg-ink px-4 py-3 text-white">
            <span className="relative">
              <BotAvatar className="h-11 w-11" thinking={sending} />
              {/* 上線中的小燈：真人接手時變灰 */}
              <span className={cn("absolute -right-0.5 bottom-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-ink", status === "AI" ? "bg-neon" : "bg-white/40")} />
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="font-black">客服小織</p>
              <p className="text-xs text-white/75">
                {status === "WAITING_HUMAN" ? "已轉接真人客服，請稍候" : status === "HUMAN" ? "真人客服回覆中" : "AI 客服・商品、訂單、退換貨都可以問"}
              </p>
            </div>
            <button onClick={() => setOpen(false)} aria-label="關閉客服視窗" className="rounded-sm p-1 hover:bg-white/15">
              <CloseIcon className="h-5 w-5" />
            </button>
          </header>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto bg-paper/60 px-3 py-4" aria-live="polite">
            {messages.length === 0 && (
              <div className="flex items-start gap-2">
                <BotAvatar className="mt-0.5 h-8 w-8" />
                <div className="rounded-2xl rounded-tl-md bg-card p-3 text-sm leading-relaxed shadow-sm">
                  你好，我是北織客服小織！可以問我商品尺寸、搭配推薦、訂單進度，或直接幫你申請退換貨。
                  <p className="mt-2 text-xs text-muted">請不要在對話中提供信用卡號或密碼。</p>
                </div>
              </div>
            )}
            {messages.map((m) => <Bubble key={m.id} m={m} siteOrigin={siteOrigin} onAsk={send} busy={sending} />)}
            {sending && (
              <div className="flex items-center gap-2" role="status">
                <BotAvatar className="h-8 w-8" thinking />
                <span className="flex gap-1 rounded-2xl rounded-tl-md bg-card px-3.5 py-3 shadow-sm" aria-label="小織正在查詢">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink/50 motion-reduce:animate-none" style={{ animationDelay: `${i * 150}ms` }} />
                  ))}
                </span>
              </div>
            )}
          </div>

          {messages.length === 0 && (
            <div className="flex flex-wrap gap-1.5 border-t border-line bg-card px-3 py-2">
              {QUICK.map((q) => (
                <button key={q} onClick={() => send(q)} className="rounded-sm border border-ink/25 px-2 py-1 text-xs font-bold hover:border-ink">
                  {q}
                </button>
              ))}
            </div>
          )}

          <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex gap-2 border-t border-line bg-card p-3">
            <label htmlFor="chat-input" className="sr-only">輸入訊息</label>
            <input
              id="chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={1000}
              placeholder="輸入問題，例如：NW012 M 號還有嗎？"
              className="input text-base sm:text-sm"
              autoComplete="off"
            />
            <button className="btn-primary shrink-0 px-4" disabled={sending || !input.trim()}>傳送</button>
          </form>
          {error && <p role="alert" className="bg-card px-3 pb-2 text-xs font-bold text-bad">{error}</p>}
        </section>
      )}

      {!open && (
        // 只有小織本人浮在右下角：滑鼠移上去會歪頭，旁邊冒出「問小織」吊牌
        <button
          onClick={() => setOpen(true)}
          aria-label="開啟客服對話，AI 客服小織"
          className="group relative flex items-center rounded-sm outline-offset-4"
        >
          <span className="kraft-tag pointer-events-none absolute right-full mr-1 translate-x-2 px-2.5 py-1 text-sm font-black whitespace-nowrap opacity-0 transition-[opacity,transform] duration-200 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100 motion-reduce:transition-none">
            問小織
          </span>
          <span className={cn("block", nudge ? "bot-hop" : "bot-float")}>
            <BotAvatar className="h-[76px] w-[76px] transition-transform duration-300 group-hover:-rotate-8 motion-reduce:transition-none" />
          </span>
        </button>
      )}
    </div>
  );
}

function Bubble({ m, siteOrigin, onAsk, busy }: { m: Msg; siteOrigin: string; onAsk: (text: string) => void; busy: boolean }) {
  if (m.role === "SYSTEM") return <p className="text-center text-xs font-bold text-muted">{m.content}</p>;
  const mine = m.role === "CUSTOMER";
  if (m.role === "AI") {
    const a = m.attachments;
    return (
      <div className="flex items-start gap-2">
        <BotAvatar className="mt-0.5 h-8 w-8" />
        <div className="min-w-0 max-w-[85%] space-y-2">
          <div className="rounded-2xl rounded-tl-md bg-card px-3.5 py-2.5 text-sm leading-relaxed break-words whitespace-pre-wrap text-ink shadow-sm">
            <Linkify text={m.content} siteOrigin={siteOrigin} />
          </div>
          {a?.products && a.products.length > 0 && <ProductCards products={a.products} onAsk={onAsk} busy={busy} />}
          {a?.links && a.links.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {a.links.map((l) => (
                <Link key={l.href} href={l.href} className="inline-flex items-center gap-1 rounded-full bg-ink px-3 py-1.5 text-xs font-bold text-white hover:bg-black">
                  {l.label}
                  <ArrowIcon className="h-3.5 w-3.5" />
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
      {m.role === "STAFF" && <span className="mb-0.5 text-[11px] font-bold text-muted">真人客服</span>}
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed break-words whitespace-pre-wrap",
          mine ? "rounded-br-md bg-ink text-white" : m.role === "STAFF" ? "rounded-tl-md bg-neon text-ink shadow-sm" : "bg-card text-ink shadow-sm",
        )}
      >
        <Linkify text={m.content} siteOrigin={siteOrigin} />
      </div>
    </div>
  );
}

// 商品卡片：可以橫向滑動；「加入購物車」會請小織接手（小織會問顏色、尺寸）
function ProductCards({ products, onAsk, busy }: { products: Card[]; onAsk: (text: string) => void; busy: boolean }) {
  return (
    <ul className="-mr-3 flex snap-x gap-2 overflow-x-auto pr-3 pb-1" aria-label="推薦商品">
      {products.map((p) => (
        <li key={p.code} className="w-36 shrink-0 snap-start overflow-hidden rounded-2xl bg-card shadow-sm">
          <Link href={p.url} className="group block">
            <div className="relative bg-sand/70 px-3 pt-3 pb-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.image} alt={p.name} loading="lazy" className="mx-auto h-24 w-24 object-contain drop-shadow transition-transform duration-300 group-hover:-translate-y-0.5" />
              {p.onSale && <span className="absolute top-2 left-2 rounded-full bg-neon px-1.5 text-[10px] font-black">特價</span>}
            </div>
            <div className="px-2.5 pt-1.5">
              <p className="font-marker text-[10px] text-muted">{p.code}</p>
              <p className="line-clamp-2 min-h-[2.5em] text-xs leading-tight font-bold group-hover:underline">{p.name}</p>
              <p className="mt-0.5 flex items-baseline gap-1">
                <span className="font-marker text-base">{p.price.toLocaleString()}</span>
                {p.originalPrice && <span className="text-[10px] text-muted line-through">{p.originalPrice.toLocaleString()}</span>}
              </p>
            </div>
          </Link>
          <button
            onClick={() => onAsk(`幫我把 ${p.code} ${p.name} 加入購物車`)}
            disabled={busy}
            className="m-2.5 mt-1.5 w-[calc(100%-1.25rem)] rounded-full border border-ink/25 py-1 text-[11px] font-bold hover:border-ink disabled:opacity-50"
          >
            加入購物車
          </button>
        </li>
      ))}
    </ul>
  );
}

function ArrowIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
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
function Linkify({ text, siteOrigin }: { text: string; siteOrigin: string }) {
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
        return <Link key={i} href={href} className="font-bold underline decoration-2">{linkLabel(href)}</Link>;
      })}
    </>
  );
}

// 小織主動推薦：一張從小織頭上冒出來的對話框（白色告示紙 + 螢光紙膠帶），
// 推薦商品掛在一小段鐵桿上，跟店裡的陳列一樣
function NudgeCard({ nudge, onClose, onMute, onAsk }: { nudge: Nudge; onClose: () => void; onMute: () => void; onAsk: () => void }) {
  return (
    <aside
      aria-label="小織推薦"
      className="card relative mr-3 mb-1 w-[min(330px,calc(100vw-2.5rem))] origin-bottom-right animate-[nudge-in_480ms_cubic-bezier(0.22,1,0.36,1)] px-4 pt-5 pb-3"
    >
      {/* 螢光紙膠帶：把便條貼在空中 */}
      <span className="absolute -top-3 left-4 -rotate-3 bg-neon/90 px-3 py-0.5 text-xs font-black tracking-wider shadow-[0_1px_0_rgb(0_0_0/.12)]">
        小織推薦
      </span>
      <button onClick={onClose} aria-label="關閉推薦" className="absolute top-2 right-2 rounded-sm p-1 text-muted hover:bg-ink/5 hover:text-ink">
        <CloseIcon className="h-4 w-4" />
      </button>

      <p className="pr-6 text-[15px] leading-snug font-bold">{nudge.message}</p>

      {/* 一小段鐵桿，商品掛在上面 */}
      <div className="relative mt-4">
        <span aria-hidden className="absolute inset-x-0 top-0 h-1.5 rounded-full bg-rail shadow-[0_2px_0_rgb(0_0_0/.18)]" />
        <ul className="grid grid-cols-3 gap-2 pt-1">
          {nudge.products.map((p, i) => (
            <li key={p.slug}>
              <Link href={`/products/${p.slug}`} onClick={onClose} className="group block text-center outline-offset-2">
                <svg aria-hidden viewBox="0 0 24 20" className="mx-auto h-4 w-5 text-rail">
                  <path d="M12 0 V6 Q12 11 7 11 Q3 11 3 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                </svg>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.image} alt="" className="mx-auto -mt-1 h-16 w-16 object-contain transition-transform duration-300 group-hover:-translate-y-0.5" />
                <span
                  className="kraft-tag swing-tag swing-on-hover mx-auto -mt-2 block w-[92%] rounded-xl px-1.5 pt-1 pb-1.5 text-left text-[11px] leading-tight"
                  style={{ ["--tilt" as string]: `${[-4, 3, -2][i % 3]}deg` }}
                >
                  <span className="font-marker text-[10px] opacity-70">{p.code}</span>
                  <span className="block truncate font-bold">{p.name}</span>
                  <span className="font-marker text-sm">{p.price.toLocaleString()}</span>
                  {p.onSale && <span className="ml-1 rounded-full bg-neon px-1.5 text-[10px] font-black">特價</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      {/* 縫線分隔 + 動作 */}
      <div className="mt-3 flex items-center justify-between border-t border-dashed border-kraft-dark/50 pt-2.5 text-xs">
        <button onClick={onMute} className="text-muted hover:text-ink hover:underline">不要再推薦</button>
        <button onClick={onAsk} className="group/ask inline-flex items-center gap-1 text-sm font-black">
          <span className="underline decoration-neon decoration-[3px] underline-offset-4 group-hover/ask:decoration-ink">問小織怎麼搭</span>
          <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4 transition-transform group-hover/ask:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 8h10M9 4l4 4-4 4" />
          </svg>
        </button>
      </div>

      {/* 對話框的尾巴，指向下面的小織 */}
      <svg aria-hidden viewBox="0 0 20 14" className="absolute -bottom-[13px] right-7 h-3.5 w-5 text-card drop-shadow-[0_2px_1px_rgb(0_0_0/.08)]">
        <path d="M0 0 H20 L14 13 Q13 14 12 12 Z" fill="currentColor" />
      </svg>
    </aside>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
