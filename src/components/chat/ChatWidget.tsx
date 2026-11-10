"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { track, type HintDetail } from "./ask";
import { useXiaozhi } from "./XiaozhiProvider";
import { XiaozhiOrb } from "./XiaozhiOrb";
import { XiaozhiSurface } from "./XiaozhiSurface";
import { CloseIcon } from "./parts";

// 浮動的小織（首頁「小織帶你逛」以外的每一頁）：
// - 右下角一顆發光的線團，點一下（或按 ⌘K / Ctrl+K）→ 從下面升起一個深色對話面板，背景頁面變暗但還看得到（像 Siri）
// - 沒打開時，像店員一樣：進站打一次招呼、在商品頁 / 購物車猶豫時遞上推薦（規則計算，不花 AI 費用）
// 對話內容和首頁舞台是同一串（存在 XiaozhiProvider）

type NudgeProduct = { slug: string; code: string; name: string; price: number; onSale: boolean; image: string };
type Nudge = { message: string; products: NudgeProduct[] };

// 依顧客在哪一頁，小織的開場白和「一點就問」的問題都不一樣（像店員看你在看什麼才開口）
export type Quick = { label: string; text: string };
export function pageContext(path: string): { greeting: string; short: string; quick: Quick[] } {
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

export function ChatWidget() {
  const pathname = usePathname();
  const x = useXiaozhi();
  const { open, setOpen, send } = x;
  // 首頁在「小織帶你逛」模式時，小織已經站在舞台中間了，不用再浮一顆
  const onStage = pathname === "/" && x.mode === "concierge";
  const hidden = pathname.startsWith("/admin") || onStage;

  const [nudgeState, setNudgeState] = useState<{ path: string; nudge: Nudge } | null>(null);
  const nudge = nudgeState?.path === pathname ? nudgeState.nudge : null;
  const [bubble, setBubble] = useState<{ path: string; kind: "greet" | "hint"; message: string; short: string; quick: Quick[]; source: string } | null>(null);
  const shownBubble = bubble?.path === pathname && !open ? bubble : null;
  const narrow = useNarrow();
  const dockRef = useRef<HTMLButtonElement>(null);
  const ctx = pageContext(pathname);

  const openWith = (source: string, text?: string) => {
    setBubble(null);
    setNudgeState(null);
    setOpen(true);
    track("open", source);
    if (text) setTimeout(() => send(text), 50);
  };

  // ⌘K / Ctrl+K：叫小織（在首頁舞台上就直接跳到輸入框）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        if (pathname.startsWith("/admin")) return;
        e.preventDefault();
        const stageInput = document.getElementById("xz-input-stage");
        if (stageInput) stageInput.focus();
        else setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pathname, setOpen]);

  // 主動推薦泡泡
  useEffect(() => {
    if (open || hidden || store.get(ls(), "nw_nudge_off")) return;
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
  }, [pathname, open, hidden]);

  // 記一筆「來逛了」（一次瀏覽一筆），後台才算得出使用率
  useEffect(() => {
    if (pathname.startsWith("/admin") || store.get(ss(), "nw_visit")) return;
    store.set(ss(), "nw_visit", "1");
    track("visit");
  }, [pathname]);

  // 進站打招呼（一次瀏覽一次；已經打開過小織、在首頁舞台或後台就不打擾）
  useEffect(() => {
    if (open || hidden || store.get(ss(), "nw_greeted")) return;
    const t = setTimeout(() => {
      if (store.get(ss(), "nw_greeted")) return;
      store.set(ss(), "nw_greeted", "1");
      const c = pageContext(pathname);
      setBubble({ path: pathname, kind: "greet", message: c.greeting, short: c.short, quick: c.quick.slice(0, 2), source: "greet" });
      track("greet_shown");
    }, GREET_DELAY);
    return () => clearTimeout(t);
  }, [pathname, open, hidden]);

  // 招呼泡泡過一陣子自己收起來
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

  // 頁面其他地方發出的「提示」（例如在尺寸表停很久）
  useEffect(() => {
    const onHint = (e: Event) => {
      const d = (e as CustomEvent<HintDetail>).detail;
      if (store.get(ss(), `nw_hint:${d.key}`) || store.get(ls(), "nw_nudge_off")) return;
      store.set(ss(), `nw_hint:${d.key}`, "1");
      setBubble({ path: window.location.pathname, kind: "hint", message: d.message, short: d.short, quick: [{ label: d.askLabel, text: d.askText }], source: d.source });
      track("hint_shown", d.source);
    };
    window.addEventListener("nw:hint", onHint);
    return () => window.removeEventListener("nw:hint", onHint);
  }, []);

  // 對話面板打開時：Esc 關閉、背景不捲動；關閉後把焦點還給小織按鈕
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    const dock = dockRef.current;
    return () => {
      window.removeEventListener("keydown", onKey);
      html.style.overflow = prev;
      dock?.focus({ preventScroll: true });
    };
  }, [open, setOpen]);

  // 換到首頁舞台時，把浮動面板收起來（對話會接著在舞台上）
  useEffect(() => {
    if (onStage && open) setOpen(false);
  }, [onStage, open, setOpen]);

  if (hidden) return null;

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-50 print:hidden" role="dialog" aria-modal="true" aria-label="跟小織對話">
          {/* 背景：頁面變暗、變模糊，點一下就關 */}
          <button type="button" aria-label="關閉小織" tabIndex={-1} onClick={() => setOpen(false)} className="absolute inset-0 cursor-default bg-ink/55 backdrop-blur-[6px] animate-[fade-veil_240ms_ease-out]" />
          <section className="absolute inset-x-0 bottom-0 mx-auto flex h-[min(88dvh,780px)] max-w-3xl flex-col overflow-hidden rounded-t-[28px] bg-ink shadow-[0_-30px_80px_-20px_rgb(0_0_0/.6)] animate-[sheet-in_420ms_var(--ease-out-soft)] md:bottom-5 md:rounded-[28px]">
            <span aria-hidden className="pointer-events-none absolute -top-40 left-1/2 h-80 w-[36rem] -translate-x-1/2 rounded-full bg-neon/10 blur-3xl" />
            <XiaozhiSurface size="sheet" greeting={ctx.greeting} quick={ctx.quick} onClose={() => setOpen(false)} autoFocus />
          </section>
        </div>
      )}

      <div className="fixed right-4 bottom-4 z-40 flex flex-col items-end gap-2 print:hidden md:right-6 md:bottom-6">
        {shownBubble && !nudge && narrow && (
          <ClerkTag
            message={shownBubble.short}
            onClick={() => {
              track(shownBubble.kind === "greet" ? "greet_click" : "hint_click", shownBubble.source);
              openWith(shownBubble.kind, shownBubble.kind === "hint" ? shownBubble.quick[0]?.text : undefined);
            }}
            onClose={() => setBubble(null)}
          />
        )}
        {shownBubble && !nudge && !narrow && (
          <ClerkBubble
            message={shownBubble.message}
            quick={shownBubble.quick}
            onPick={(q) => {
              track(shownBubble.kind === "greet" ? "greet_click" : "hint_click", shownBubble.source);
              openWith(shownBubble.kind, q.text);
            }}
            onClose={() => setBubble(null)}
          />
        )}
        {nudge && !open && (
          <NudgeCard
            nudge={nudge}
            onClose={() => setNudgeState(null)}
            onMute={() => { store.set(ls(), "nw_nudge_off", "1"); setNudgeState(null); }}
            onAsk={() => openWith("nudge", "剛剛推薦的這幾件，要怎麼搭配比較好？")}
          />
        )}

        {/* 小織本人：一顆發光的線團，滑鼠移上去冒出「問小織 ⌘K」 */}
        <button
          ref={dockRef}
          type="button"
          onClick={() => openWith("avatar")}
          aria-label="叫小織（AI 店員），快捷鍵 Ctrl 或 ⌘ 加 K"
          aria-expanded={open}
          className={cn("group relative flex cursor-pointer items-center rounded-full outline-offset-4", open && "invisible")}
        >
          <span className="pointer-events-none absolute right-full mr-3 flex translate-x-2 items-center gap-2 rounded-full bg-ink px-3.5 py-2 text-sm font-bold whitespace-nowrap text-white opacity-0 shadow-lg transition-[opacity,transform] duration-200 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100 motion-reduce:transition-none">
            問小織
            <kbd className="rounded-md bg-white/15 px-1.5 font-mono text-[11px] text-white/80">⌘K</kbd>
          </span>
          <span className={cn("block", (nudge || shownBubble) && "bot-hop")}>
            <XiaozhiOrb className="h-16 w-16 transition-transform duration-300 group-hover:scale-110 motion-reduce:transition-none" />
          </span>
        </button>
      </div>
    </>
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
