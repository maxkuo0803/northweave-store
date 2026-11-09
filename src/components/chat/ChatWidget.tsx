"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// 右下角的客服聊天視窗 + 主動推薦泡泡。
// - 打開時每 4 秒問一次有沒有新訊息（真人客服的回覆也是這樣收到）
// - 沒打開時，在商品頁 / 購物車停留一段時間，會跳出推薦泡泡（規則計算，不花 AI 費用）

type Msg = { id: string; role: "CUSTOMER" | "AI" | "STAFF" | "SYSTEM"; content: string; createdAt: string };
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
    <div className="fixed right-4 bottom-4 z-50 flex flex-col items-end gap-3 print:hidden">
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
            <ChatIcon className="h-5 w-5" />
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
              <div className="rounded-sm bg-card p-3 text-sm leading-relaxed shadow-sm">
                你好，我是北織客服小織！可以問我商品尺寸、搭配推薦、訂單進度，或直接幫你申請退換貨。
                <p className="mt-2 text-xs text-muted">請不要在對話中提供信用卡號或密碼。</p>
              </div>
            )}
            {messages.map((m) => <Bubble key={m.id} m={m} siteOrigin={siteOrigin} />)}
            {sending && <p className="pl-1 text-xs text-muted">小織正在查詢…</p>}
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
        <button onClick={() => setOpen(true)} className="btn-primary h-12 gap-2 px-4" aria-label="開啟客服對話">
          <ChatIcon className="h-5 w-5" />
          問小織
        </button>
      )}
    </div>
  );
}

function Bubble({ m, siteOrigin }: { m: Msg; siteOrigin: string }) {
  if (m.role === "SYSTEM") return <p className="text-center text-xs font-bold text-muted">{m.content}</p>;
  const mine = m.role === "CUSTOMER";
  return (
    <div className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
      {m.role === "STAFF" && <span className="mb-0.5 text-[11px] font-bold text-muted">真人客服</span>}
      <div
        className={cn(
          "max-w-[85%] rounded-sm px-3 py-2 text-sm leading-relaxed break-words whitespace-pre-wrap",
          mine ? "bg-ink text-white" : m.role === "STAFF" ? "bg-neon text-ink shadow-sm" : "bg-card text-ink shadow-sm",
        )}
      >
        <Linkify text={m.content} siteOrigin={siteOrigin} />
      </div>
    </div>
  );
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
        return <Link key={i} href={href} className="font-bold underline decoration-2">{href.startsWith("/products/") ? "查看商品" : href.startsWith("/account") ? "前往會員中心" : "開啟連結"}</Link>;
      })}
    </>
  );
}

function NudgeCard({ nudge, onClose, onMute, onAsk }: { nudge: Nudge; onClose: () => void; onMute: () => void; onAsk: () => void }) {
  return (
    <aside aria-label="推薦商品" className="neon-card relative w-[min(340px,calc(100vw-2rem))] origin-bottom-right animate-[nudge-in_420ms_cubic-bezier(0.22,1,0.36,1)] p-4">
      <button onClick={onClose} aria-label="關閉推薦" className="absolute top-2 right-2 rounded-sm p-1 hover:bg-black/10">
        <CloseIcon className="h-4 w-4" />
      </button>
      <p className="pr-6 text-sm font-bold leading-snug">{nudge.message}</p>
      <ul className="mt-3 grid grid-cols-3 gap-2">
        {nudge.products.map((p, i) => (
          <li key={p.slug}>
            <Link href={`/products/${p.slug}`} onClick={onClose} className="group block text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.image} alt="" className="mx-auto h-16 w-16 object-contain drop-shadow" />
              <span className="kraft-tag swing-tag swing-on-hover mt-1 block px-1 py-1 text-[11px] leading-tight" style={{ ["--tilt" as string]: `${[-3, 2, -2][i % 3]}deg` }}>
                <span className="block truncate font-bold">{p.name}</span>
                <span className="font-marker">NT${p.price.toLocaleString()}</span>
                {p.onSale && <span className="ml-1 font-bold">特價</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center justify-between gap-2 text-xs">
        <button onClick={onMute} className="text-ink/70 underline hover:text-ink">不要再推薦</button>
        <button onClick={onAsk} className="btn-primary px-3 py-1.5 text-xs">問小織怎麼搭</button>
      </div>
    </aside>
  );
}

function ChatIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden>
      <path d="M4 5h16v11H9l-5 4z" />
      <path d="M8 9.5h8M8 12.5h5" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
