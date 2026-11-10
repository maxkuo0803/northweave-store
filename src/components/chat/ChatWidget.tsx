"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { BotAvatar } from "./BotAvatar";
import { track, type AskDetail, type HintDetail } from "./ask";

// 右下角的客服聊天視窗 + 主動推薦泡泡。
// - 打開時每 4 秒問一次有沒有新訊息（真人客服的回覆也是這樣收到）
// - 沒打開時，在商品頁 / 購物車停留一段時間，會跳出推薦泡泡（規則計算，不花 AI 費用）

// AI 回覆可以附帶：商品卡片、按鈕（例如「前往結帳」）、要不要重新整理頁面（購物車有變動）
type Variant = { id: string; color: string; hex: string; size: string; soldOut: boolean };
type Card = { code: string; name: string; price: number; originalPrice?: number; onSale?: boolean; url: string; image: string; pick?: boolean; variants?: Variant[] };
type Choice = { label: string; reply: string };
type Attachments = { products?: Card[]; choices?: Choice[]; links?: { label: string; href: string }[]; refresh?: boolean };
const CART_NOTE = "（已用按鈕加入購物車）";
type Msg = { id: string; role: "CUSTOMER" | "AI" | "STAFF" | "SYSTEM"; content: string; attachments?: Attachments | null; createdAt: string };
type NudgeProduct = { slug: string; code: string; name: string; price: number; onSale: boolean; image: string };
type Nudge = { message: string; products: NudgeProduct[] };

// 依顧客在哪一頁，小織的開場白和「一點就問」的問題都不一樣（像店員看你在看什麼才開口）
type Quick = { label: string; text: string };
function pageContext(path: string): { greeting: string; short: string; quick: Quick[] } {
  const code = path.match(/^\/products\/(nw\d+)/i)?.[1]?.toUpperCase();
  if (code) {
    return {
      greeting: `在看 ${code} 嗎？尺寸、搭配、材質都可以問我。`,
      short: "尺寸、搭配都可以問我",
      quick: [
        { label: "幫我挑尺寸", text: `幫我挑 ${code} 的尺寸` },
        { label: "這件怎麼搭", text: `${code} 怎麼搭配？` },
        { label: "會不會透、好不好洗", text: `${code} 的材質會不會透？好不好洗？` },
      ],
    };
  }
  const order = path.match(/^\/account\/orders\/(NW\d+)/i)?.[1]?.toUpperCase();
  if (order) {
    return {
      greeting: `訂單 ${order} 想問什麼？`,
      short: "這筆訂單有問題？問我",
      quick: [
        { label: "物流到哪了", text: `訂單 ${order} 的物流到哪了？` },
        { label: "我想退換貨", text: `訂單 ${order} 我想退換貨` },
        { label: "取消訂單", text: `我想取消訂單 ${order}` },
      ],
    };
  }
  if (path === "/cart" || path === "/checkout") {
    return {
      greeting: "結帳前有什麼要幫忙的嗎？",
      short: "結帳前有問題？問我",
      quick: [
        { label: "幫我湊免運", text: "幫我湊免運，推薦剛好補上差額的商品" },
        { label: "幫我結帳", text: "幫我結帳" },
        { label: "有優惠碼嗎", text: "現在有什麼優惠碼可以用？" },
      ],
    };
  }
  if (path.startsWith("/account")) {
    return {
      greeting: "會員的事都可以交給我。",
      short: "訂單、退換貨都能問我",
      quick: [
        { label: "我的訂單到哪了", text: "我的訂單到哪了？" },
        { label: "我想退換貨", text: "我想退換貨" },
        { label: "看我的購物車", text: "我的購物車有什麼？" },
      ],
    };
  }
  if (path.startsWith("/products")) {
    return {
      greeting: "在找什麼樣的衣服？用說的就好。",
      short: "說出想找的，我幫你找",
      quick: [
        { label: "約會穿搭", text: "推薦適合約會穿的衣服" },
        { label: "下雨天的外套", text: "下雨天穿的外套有推薦嗎？" },
        { label: "上班也能穿", text: "推薦上班也能穿的衣服" },
      ],
    };
  }
  return {
    greeting: "歡迎光臨！我是店員小織，找衣服、問尺寸、查訂單都可以問我。",
    short: "歡迎光臨！有問題問我",
    quick: [
      { label: "幫我推薦", text: "幫我推薦幾件好搭的衣服" },
      { label: "我的訂單到哪了", text: "我的訂單到哪了？" },
      { label: "運費怎麼算", text: "運費怎麼算？" },
    ],
  };
}

// 招呼泡泡：進站後 3.5 秒出現、9 秒後自己收起，一次瀏覽只打一次招呼（不擋畫面、不打擾）
const GREET_DELAY = 3500;
const GREET_SHOW_MS = 9000;
const NUDGE_DELAY = (path: string) => (path === "/cart" ? 5000 : path.startsWith("/products/") ? 9000 : 25000);
const MAX_NUDGES_PER_SESSION = 3;

// 螢幕寬度小於 1400px（手機、筆電）：頁面右邊沒有空白，招呼改成一行小標籤，不蓋到商品和按鈕
const NARROW = "(max-width: 1399px)";
const subscribeNarrow = (cb: () => void) => {
  const m = window.matchMedia(NARROW);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};
const useNarrow = () => useSyncExternalStore(subscribeNarrow, () => window.matchMedia(NARROW).matches, () => false);

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
  const ctx = pageContext(pathname);
  // 招呼泡泡 / 猶豫時的提示泡泡（像店員走過來問一句）
  const [bubble, setBubble] = useState<{ path: string; kind: "greet" | "hint"; message: string; short: string; quick: Quick[]; source: string } | null>(null);
  const shownBubble = bubble?.path === pathname && !open ? bubble : null;
  const narrow = useNarrow();
  const [progress, setProgress] = useState<string | null>(null); // 小織正在做什麼（即時顯示）

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
      track("nudge_shown");
    }, NUDGE_DELAY(pathname));
    return () => clearTimeout(t);
  }, [pathname, open]);

  // 記一筆「來逛了」（一次瀏覽一筆），後台才算得出使用率
  useEffect(() => {
    if (pathname.startsWith("/admin") || store.get(ss(), "nw_visit")) return;
    store.set(ss(), "nw_visit", "1");
    track("visit");
  }, [pathname]);

  // 進站打招呼（一次瀏覽一次；已經打開過小織或在後台就不打擾）
  useEffect(() => {
    if (open || pathname.startsWith("/admin") || store.get(ss(), "nw_greeted")) return;
    const t = setTimeout(() => {
      if (store.get(ss(), "nw_greeted")) return;
      store.set(ss(), "nw_greeted", "1");
      const c = pageContext(pathname);
      setBubble({ path: pathname, kind: "greet", message: c.greeting, short: c.short, quick: c.quick.slice(0, 2), source: "greet" });
      track("greet_shown");
    }, GREET_DELAY);
    return () => clearTimeout(t);
  }, [pathname, open]);

  // 招呼泡泡過一陣子自己收起來（顧客沒理它就不要一直佔著畫面）
  useEffect(() => {
    if (bubble?.kind !== "greet") return;
    const t = setTimeout(() => setBubble((b) => (b?.kind === "greet" ? null : b)), GREET_SHOW_MS);
    return () => clearTimeout(t);
  }, [bubble]);

  // 像店員：打完招呼，顧客開始逛（捲動超過 120px）就自己退開
  useEffect(() => {
    if (bubble?.kind !== "greet") return;
    const startY = window.scrollY;
    const onScroll = () => {
      if (Math.abs(window.scrollY - startY) > 120) setBubble((b) => (b?.kind === "greet" ? null : b));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [bubble]);

  // 網站其他地方叫小織（商品頁的「問小織」按鈕、搜尋找不到、購物車…）
  const sendRef = useRef<(text: string) => void>(() => {});
  useEffect(() => {
    const onAsk = (e: Event) => {
      const d = (e as CustomEvent<AskDetail>).detail;
      setBubble(null);
      setOpen(true);
      track("open", d.source);
      if (d.text) setTimeout(() => sendRef.current(d.text!), 50);
    };
    const onHint = (e: Event) => {
      const d = (e as CustomEvent<HintDetail>).detail;
      if (store.get(ss(), `nw_hint:${d.key}`) || store.get(ls(), "nw_nudge_off")) return;
      store.set(ss(), `nw_hint:${d.key}`, "1");
      setBubble({ path: window.location.pathname, kind: "hint", message: d.message, short: d.short, quick: [{ label: d.askLabel, text: d.askText }], source: d.source });
      track("hint_shown", d.source);
    };
    window.addEventListener("nw:ask", onAsk);
    window.addEventListener("nw:hint", onHint);
    return () => {
      window.removeEventListener("nw:ask", onAsk);
      window.removeEventListener("nw:hint", onHint);
    };
  }, []);

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
      // 用串流方式：伺服器每做一步就傳一行回來（例如「找商品中…」），最後才傳完整回覆
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
        body: JSON.stringify({ text: t, path: pathname }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        setMessages((m) => m.filter((x) => x.id !== temp.id));
        setError(data.error ?? "傳送失敗，請再試一次");
        setInput(t);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let done: { status: string; messages: Msg[] } | null = null;
      for (;;) {
        const { value, done: end } = await reader.read();
        if (value) buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as { type: "progress"; label: string } | { type: "done"; status: string; messages: Msg[] } | { type: "error"; error: string };
          if (ev.type === "progress") setProgress(ev.label);
          else if (ev.type === "done") done = ev;
          else throw new Error(ev.error);
        }
        if (end) break;
      }
      setMessages((m) => m.filter((x) => x.id !== temp.id));
      if (!done) throw new Error("沒有收到回覆");
      setStatus(done.status);
      merge(done.messages);
      // 小織幫忙加了購物車 / 下了單 → 重新整理頁面資料（右上角購物車數量、購物車頁會更新）
      if (done.messages.some((m) => m.attachments?.refresh)) router.refresh();
    } catch {
      setMessages((m) => m.filter((x) => x.id !== temp.id));
      setError("網路好像斷了，請再試一次");
      setInput(t);
    } finally {
      setSending(false);
      setProgress(null);
    }
  }
  useEffect(() => {
    sendRef.current = send;
  });

  // 選擇器直接加入購物車後：把「已加入」紀錄顯示在對話裡，並更新右上角購物車數量
  const onAdded = useCallback((note: Msg) => {
    merge([note]);
    router.refresh();
  }, [merge, router]);

  if (pathname.startsWith("/admin")) return null;

  return (
    <div className="fixed right-3 bottom-3 z-50 flex flex-col items-end gap-1 print:hidden">
      {shownBubble && !nudge && narrow && (
        <ClerkTag
          message={shownBubble.short}
          onClick={() => {
            const q = shownBubble.quick[0];
            setBubble(null);
            setOpen(true);
            track(shownBubble.kind === "greet" ? "greet_click" : "hint_click", shownBubble.source);
            if (shownBubble.kind === "hint" && q) setTimeout(() => sendRef.current(q.text), 50);
          }}
          onClose={() => setBubble(null)}
        />
      )}

      {shownBubble && !nudge && !narrow && (
        <ClerkBubble
          message={shownBubble.message}
          quick={shownBubble.quick}
          onPick={(q) => {
            setBubble(null);
            setOpen(true);
            track(shownBubble.kind === "greet" ? "greet_click" : "hint_click", shownBubble.source);
            setTimeout(() => sendRef.current(q.text), 50);
          }}
          onClose={() => setBubble(null)}
        />
      )}

      {nudge && !open && (
        <NudgeCard
          nudge={nudge}
          onClose={() => setNudge(null)}
          onMute={() => { store.set(ls(), "nw_nudge_off", "1"); setNudge(null); }}
          onAsk={() => { setNudge(null); setOpen(true); track("open", "nudge"); send("剛剛推薦的這幾件，要怎麼搭配比較好？"); }}
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
                  {ctx.greeting}
                  <p className="mt-2 text-xs text-muted">請不要在對話中提供信用卡號或密碼。</p>
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <Bubble key={m.id} m={m} siteOrigin={siteOrigin} onAsk={send} busy={sending} isLatest={i === messages.length - 1} onAdded={onAdded} />
            ))}
            {sending && (
              <div className="flex items-center gap-2" role="status">
                <BotAvatar className="h-8 w-8" thinking />
                <span className="flex items-center gap-2 rounded-2xl rounded-tl-md bg-card px-3.5 py-2.5 shadow-sm">
                  <span className="flex gap-1" aria-hidden>
                    {[0, 1, 2].map((i) => (
                      <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink/50 motion-reduce:animate-none" style={{ animationDelay: `${i * 150}ms` }} />
                    ))}
                  </span>
                  <span className="text-xs text-muted">{progress ?? "小織想一下"}</span>
                </span>
              </div>
            )}
          </div>

          {messages.length === 0 && (
            <div className="flex flex-wrap gap-1.5 border-t border-line bg-card px-3 py-2">
              {ctx.quick.map((q) => (
                <button key={q.label} onClick={() => send(q.text)} className="rounded-full border border-ink/20 px-3 py-1 text-xs font-bold hover:border-ink">
                  {q.label}
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
          onClick={() => {
            setOpen(true);
            setBubble(null);
            track("open", "avatar");
          }}
          aria-label="開啟客服對話，AI 客服小織"
          className="group relative flex items-center rounded-sm outline-offset-4"
        >
          <span className="kraft-tag pointer-events-none absolute right-full mr-1 translate-x-2 px-2.5 py-1 text-sm font-black whitespace-nowrap opacity-0 transition-[opacity,transform] duration-200 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100 motion-reduce:transition-none">
            問小織
          </span>
          <span className={cn("block", nudge || shownBubble ? "bot-hop" : "bot-float")}>
            <BotAvatar className="h-[76px] w-[76px] transition-transform duration-300 group-hover:-rotate-8 motion-reduce:transition-none" />
          </span>
        </button>
      )}
    </div>
  );
}

type BubbleProps = { m: Msg; siteOrigin: string; onAsk: (text: string) => void; busy: boolean; isLatest: boolean; onAdded: (note: Msg) => void };

function Bubble({ m, siteOrigin, onAsk, busy, isLatest, onAdded }: BubbleProps) {
  if (m.role === "SYSTEM") return <p className="text-center text-xs font-bold text-muted">{m.content}</p>;
  // 用選擇器加入購物車的紀錄：小小一行，不佔版面
  if (m.role === "CUSTOMER" && m.content.startsWith(CART_NOTE)) {
    return (
      <p className="flex items-center justify-end gap-1 text-xs font-bold text-ok">
        <CheckIcon className="h-3.5 w-3.5" />
        已加入購物車：{m.content.slice(CART_NOTE.length)}
      </p>
    );
  }
  const mine = m.role === "CUSTOMER";
  if (m.role === "AI") {
    const a = m.attachments;
    return (
      <div className="flex items-start gap-2">
        <BotAvatar className="mt-0.5 h-8 w-8" />
        <div className="min-w-0 max-w-[85%] flex-1 space-y-2">
          <div className="w-fit rounded-2xl rounded-tl-md bg-card px-3.5 py-2.5 text-sm leading-relaxed break-words whitespace-pre-wrap text-ink shadow-sm">
            <Linkify text={m.content} siteOrigin={siteOrigin} />
          </div>
          {a?.products && a.products.length > 0 && <ProductCards products={a.products} onAdded={onAdded} />}
          {/* 選項按鈕：只在最新一則顯示，避免顧客按到舊的選項 */}
          {isLatest && a?.choices && a.choices.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {a.choices.map((c, i) => (
                <button
                  key={c.label}
                  onClick={() => onAsk(c.reply)}
                  disabled={busy}
                  className={cn(
                    "rounded-full px-3.5 py-1.5 text-sm font-bold transition-colors disabled:opacity-50",
                    i === 0 ? "bg-ink text-white hover:bg-black" : "border border-ink/30 bg-card hover:border-ink",
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}
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

// 商品卡片：
// - 一般：小卡片橫向滑動，按「加入購物車」就在卡片上展開顏色 / 尺寸選擇器（不用再問 AI）
// - pick = true（AI 要顧客選規格）：一出現就是展開的選擇器
function ProductCards({ products, onAdded }: { products: Card[]; onAdded: (note: Msg) => void }) {
  const [openCodes, setOpenCodes] = useState(() => new Set(products.filter((p) => p.pick).map((p) => p.code)));
  const open = products.filter((p) => openCodes.has(p.code) && p.variants?.length);
  const rest = products.filter((p) => !open.includes(p));
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
        <ul className="-mr-3 flex snap-x gap-2 overflow-x-auto pr-3 pb-1" aria-label="推薦商品">
          {rest.map((p) => (
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
                  <Price p={p} />
                </div>
              </Link>
              {p.variants?.length ? (
                <button onClick={() => toggle(p.code, true)} className="m-2.5 mt-1.5 w-[calc(100%-1.25rem)] rounded-full border border-ink/25 py-1 text-[11px] font-bold hover:border-ink">
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
    <p className="mt-0.5 flex items-baseline gap-1">
      <span className="font-marker text-base">{p.price.toLocaleString()}</span>
      {p.originalPrice && <span className="text-[10px] text-muted line-through">{p.originalPrice.toLocaleString()}</span>}
    </p>
  );
}

// 顏色 / 尺寸選擇器：選色塊 → 選尺寸 → 加入購物車（售完的尺寸是灰色、畫刪除線，不能選）
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
    <div className="flex gap-3 rounded-2xl bg-card p-3 shadow-sm">
      <Link href={p.url} className="shrink-0 rounded-xl bg-sand/70 p-1.5" aria-label={`查看 ${p.name}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={p.image} alt="" className="h-20 w-20 object-contain drop-shadow" />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-1">
          <div className="min-w-0">
            <p className="font-marker text-[10px] text-muted">{p.code}</p>
            <p className="truncate text-sm leading-tight font-bold">{p.name}</p>
          </div>
          <button onClick={onClose} aria-label="收起選擇器" className="-mt-1 -mr-1 shrink-0 rounded-full p-1 text-muted hover:bg-ink/5 hover:text-ink">
            <CloseIcon className="h-3.5 w-3.5" />
          </button>
        </div>
        <Price p={p} />

        <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="顏色">
          {colors.map(([c, hex]) => (
            <button
              key={c}
              role="radio"
              aria-checked={color === c}
              aria-label={`${c}${colorSoldOut(c) ? "（售完）" : ""}`}
              title={c}
              disabled={colorSoldOut(c)}
              onClick={() => { setColor(c); setSize(null); setState({}); }}
              className={cn("h-6 w-6 rounded-full border border-black/15 ring-offset-2 ring-offset-card disabled:opacity-30", color === c && "ring-2 ring-ink")}
              style={{ backgroundColor: hex }}
            />
          ))}
          {color && <span className="self-center text-xs text-muted">{color}</span>}
        </div>

        <div className="mt-2 flex flex-wrap gap-1" role="radiogroup" aria-label="尺寸">
          {sizes.map((v) => (
            <button
              key={v.id}
              role="radio"
              aria-checked={size === v.size}
              disabled={v.soldOut}
              onClick={() => { setSize(v.size); setState({}); }}
              className={cn(
                "min-w-9 rounded-full border px-2 py-0.5 text-xs font-bold",
                size === v.size ? "border-ink bg-ink text-white" : "border-ink/25 hover:border-ink",
                v.soldOut && "cursor-not-allowed border-line text-muted line-through",
              )}
            >
              {v.size}
            </button>
          ))}
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <button onClick={add} disabled={!chosen || state.busy} className="shrink-0 rounded-full bg-ink px-3.5 py-1.5 text-xs font-bold whitespace-nowrap text-white hover:bg-black disabled:opacity-40">
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

// 窄螢幕的招呼：頭像旁邊一行小標籤，點了才打開（不蓋住商品）
function ClerkTag({ message, onClick, onClose }: { message: string; onClick: () => void; onClose: () => void }) {
  return (
    <div className="mr-2 -mb-1 flex max-w-[calc(100vw-1.5rem)] animate-[nudge-in_420ms_cubic-bezier(0.22,1,0.36,1)] items-center gap-1 rounded-full bg-ink py-1 pr-1 pl-3.5 text-xs font-bold text-white shadow-lg">
      <button onClick={onClick} className="truncate py-1">{message}</button>
      <button onClick={onClose} aria-label="關閉" className="shrink-0 rounded-full p-1.5 hover:bg-white/15">
        <CloseIcon className="h-3 w-3" />
      </button>
    </div>
  );
}

// 店員式的小對話框：一句話 + 一兩個「一點就問」的按鈕，從小織頭上冒出來，不擋畫面
function ClerkBubble({ message, quick, onPick, onClose }: { message: string; quick: Quick[]; onPick: (q: Quick) => void; onClose: () => void }) {
  return (
    <aside
      role="status"
      className="card relative mr-3 mb-1 w-[min(290px,calc(100vw-2.5rem))] origin-bottom-right animate-[nudge-in_420ms_cubic-bezier(0.22,1,0.36,1)] px-4 pt-3.5 pb-3"
    >
      <button onClick={onClose} aria-label="關閉" className="absolute top-2 right-2 rounded-full p-1 text-muted hover:bg-ink/5 hover:text-ink">
        <CloseIcon className="h-3.5 w-3.5" />
      </button>
      <p className="pr-5 text-sm leading-snug font-bold">{message}</p>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {quick.map((q, i) => (
          <button
            key={q.label}
            onClick={() => onPick(q)}
            className={cn("rounded-full px-3 py-1.5 text-xs font-bold", i === 0 ? "bg-ink text-white hover:bg-black" : "border border-ink/20 hover:border-ink")}
          >
            {q.label}
          </button>
        ))}
      </div>
      <svg aria-hidden viewBox="0 0 20 14" className="absolute right-7 -bottom-[13px] h-3.5 w-5 text-card drop-shadow-[0_2px_1px_rgb(0_0_0/.08)]">
        <path d="M0 0 H20 L14 13 Q13 14 12 12 Z" fill="currentColor" />
      </svg>
    </aside>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 8.5l3 3 7-7" />
    </svg>
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
