"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { useXiaozhi } from "./XiaozhiProvider";
import { XiaozhiOrb, type OrbState } from "./XiaozhiOrb";
import { useDictation } from "./useDictation";
import { CloseIcon, MicIcon, SendIcon, SpeakerIcon, StopIcon, Turn, type Size } from "./parts";

// 跟小織對話的「畫面」：首頁大舞台（size="stage"）和其他頁面的對話框（size="sheet"）共用。
// 版面像 Siri：
//   還沒開口 → 中間一顆大光球 + 一句招呼 + 幾個「一點就問」
//   開始對話 → 光球縮到左上角，對話用大字一段段往下排，最新的最清楚
//   最下面固定一條輸入列：可以打字，也可以按麥克風用說的

export type Quick = { label: string; text: string };

const HISTORY = 12; // 舞台上一次只攤開最近 12 則，比較清爽

const noop = () => () => {};
const useCanSpeak = () => useSyncExternalStore(noop, () => "speechSynthesis" in window, () => false);

type Props = {
  size: Size;
  greeting: string;
  sub?: string;
  quick: Quick[];
  emptyExtra?: React.ReactNode; // 還沒開口時，招呼下面多放的東西（首頁：今天掛出來的衣服）
  topExtra?: React.ReactNode; // 上方列右邊多放的東西（首頁：「自己逛」）
  onClose?: () => void;
  autoFocus?: boolean;
};

export function XiaozhiSurface({ size, greeting, sub, quick, emptyExtra, topExtra, onClose, autoFocus }: Props) {
  const x = useXiaozhi();
  const sheet = size === "sheet";
  const voice = useDictation((t) => x.send(t, { voice: true }));
  const canSpeak = useCanSpeak();
  const [showAll, setShowAll] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const first = useRef(true);

  const has = x.messages.length > 0;
  const hidden = showAll ? 0 : Math.max(0, x.messages.length - HISTORY);
  const shown = x.messages.slice(hidden);
  const orb: OrbState = voice.listening ? "listening" : x.sending ? "thinking" : x.speaking ? "speaking" : "idle";

  const statusLine =
    x.status === "WAITING_HUMAN" ? "已轉接真人客服，請稍候"
    : x.status === "HUMAN" ? "真人客服回覆中"
    : voice.listening ? "我在聽，說完會自己送出"
    : x.sending ? (x.progress ?? "想一下…")
    : x.speaking ? "說話中"
    : "AI 店員・找衣服、問尺寸、查訂單都可以";

  // 有新的話就捲到最下面（第一次載入不要動畫，直接跳過去）
  useEffect(() => {
    if (!has && !voice.interim && !x.sending) return;
    endRef.current?.scrollIntoView({ block: "end", behavior: first.current ? "auto" : "smooth" });
    first.current = false;
  }, [x.messages.length, x.sending, voice.interim, has]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const ask = (t: string) => x.send(t);

  return (
    <div className={cn("flex flex-col text-white", sheet ? "h-full" : "min-h-full")}>
      {/* ───── 上方列：小光球 + 名字 + 狀態 + 朗讀 / 關閉 ───── */}
      <div className={cn("flex items-center gap-3", sheet ? "px-5 pt-4 pb-3 md:px-7" : "pt-6 pb-4")}>
        <XiaozhiOrb state={orb} className={cn("h-10 w-10 transition-[opacity,transform] duration-500", has ? "opacity-100" : "scale-50 opacity-0")} />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="font-serif text-lg font-black tracking-wide">小織</p>
          <p className="truncate text-xs text-white/65" aria-live="polite">{statusLine}</p>
        </div>
        {canSpeak && (
          <button
            type="button"
            onClick={() => x.setSpeakReplies(!x.speakReplies)}
            aria-pressed={x.speakReplies}
            aria-label={x.speakReplies ? "關閉朗讀回覆" : "開啟朗讀回覆"}
            title={x.speakReplies ? "朗讀回覆：開" : "朗讀回覆：關（用說的問，小織還是會用說的回答）"}
            className={cn(
              "grid h-11 w-11 cursor-pointer place-items-center rounded-full transition-colors",
              x.speakReplies ? "bg-white/15 text-neon" : "text-white/70 hover:bg-white/10 hover:text-white",
            )}
          >
            <SpeakerIcon off={!x.speakReplies} className="h-5 w-5" />
          </button>
        )}
        {topExtra}
        {onClose && (
          <button type="button" onClick={onClose} aria-label="關閉小織" className="grid h-11 w-11 cursor-pointer place-items-center rounded-full text-white/70 hover:bg-white/10 hover:text-white">
            <CloseIcon className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* ───── 對話區 ───── */}
      <div className={cn("flex-1", sheet && "overflow-y-auto overscroll-contain px-5 md:px-7")}>
        {!has ? (
          <div className={cn("mx-auto flex max-w-2xl flex-col items-center text-center", sheet ? "pt-4 pb-6" : "pt-[6vh] pb-10 md:pt-[9vh]")}>
            <XiaozhiOrb state={orb} className={sheet ? "h-24 w-24" : "h-36 w-36 md:h-44 md:w-44"} />
            <h2 className={cn("display mt-8 text-balance text-white", sheet ? "text-2xl md:text-3xl" : "text-[clamp(32px,4.6vw,60px)] leading-[1.1]")}>{greeting}</h2>
            {sub && <p className={cn("mt-4 max-w-lg text-pretty leading-relaxed text-white/70", sheet ? "text-sm" : "text-base md:text-lg")}>{sub}</p>}
            {voice.interim ? (
              <p className="mt-8 text-xl leading-snug text-white/85 md:text-2xl">{voice.interim}</p>
            ) : (
              <ul className="mt-8 flex flex-wrap justify-center gap-2">
                {quick.map((q) => (
                  <li key={q.label}>
                    <button
                      type="button"
                      onClick={() => ask(q.text)}
                      className="min-h-11 cursor-pointer rounded-full border border-white/20 bg-white/[0.06] px-4 text-sm font-bold text-white transition-colors hover:border-white/60 hover:bg-white/10"
                    >
                      {q.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {emptyExtra}
          </div>
        ) : (
          <div className={cn("mx-auto w-full", sheet ? "pb-4" : "max-w-3xl pb-6")}>
            {hidden > 0 && (
              <button type="button" onClick={() => setShowAll(true)} className="mx-auto mb-8 block min-h-11 cursor-pointer rounded-full px-4 text-sm font-bold text-white/65 hover:text-white">
                顯示更早的 {hidden} 則對話
              </button>
            )}
            <ol className={cn("space-y-7", !sheet && "md:space-y-9")} aria-live="polite">
              {shown.map((m, i) => {
                const latest = i === shown.length - 1;
                // 最新一輪最清楚，舊的對話淡一點（像 Siri）
                const recent = i >= shown.length - 2;
                return (
                  <li key={m.id} className={cn("transition-opacity duration-500", !recent && "opacity-60 hover:opacity-100")}>
                    <Turn m={m} size={size} siteOrigin={x.siteOrigin} onAsk={ask} busy={x.sending} isLatest={latest} onAdded={x.onAdded} />
                  </li>
                );
              })}
            </ol>
            {voice.interim && <p className="mt-7 ml-auto max-w-[85%] text-right text-lg leading-snug text-white/85 md:text-xl">{voice.interim}</p>}
            {x.sending && (
              <div className="mt-7 flex items-center gap-3" role="status">
                <XiaozhiOrb state="thinking" className="h-7 w-7" />
                <span className="text-sm text-white/70">{x.progress ?? "小織想一下"}</span>
              </div>
            )}
          </div>
        )}
        <div ref={endRef} className={sheet ? "scroll-mb-4" : "scroll-mb-36"} />
      </div>

      {/* ───── 輸入列：打字或用說的 ───── */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          x.send(x.draft);
        }}
        className={cn(
          "sticky bottom-0 z-10 bg-linear-to-t from-ink from-60% to-transparent pt-6",
          sheet ? "px-5 pb-[max(env(safe-area-inset-bottom),20px)] md:px-7" : "pb-[max(env(safe-area-inset-bottom),24px)]",
        )}
      >
        <div className={cn("mx-auto", !sheet && "max-w-3xl")}>
          <div className="flex items-center gap-1.5 rounded-full border border-white/20 bg-[#26292b] p-1.5 pl-5 transition-colors focus-within:border-neon/80 focus-within:ring-2 focus-within:ring-neon/25">
            <label htmlFor={`xz-input-${size}`} className="sr-only">跟小織說</label>
            <input
              id={`xz-input-${size}`}
              ref={inputRef}
              value={x.draft}
              onChange={(e) => x.setDraft(e.target.value)}
              maxLength={1000}
              placeholder={voice.listening ? "我在聽…" : "跟小織說，例如：下雨天穿的外套"}
              className="h-11 min-w-0 flex-1 bg-transparent text-base text-white outline-none placeholder:text-white/50 focus-visible:outline-none" /* 焦點框畫在外面整條輸入列上 */
              autoComplete="off"
              enterKeyHint="send"
            />
            {voice.supported && (
              <button
                type="button"
                onClick={() => (voice.listening ? voice.stop() : voice.start())}
                aria-label={voice.listening ? "停止聆聽" : "用說的"}
                aria-pressed={voice.listening}
                className={cn(
                  "relative grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-full transition-colors",
                  voice.listening ? "mic-live bg-neon text-ink" : x.draft.trim() ? "text-white/75 hover:bg-white/10 hover:text-white" : "bg-neon text-ink hover:bg-[#f5ef5a]",
                )}
              >
                {voice.listening ? <StopIcon className="h-5 w-5" /> : <MicIcon className="h-5 w-5" />}
              </button>
            )}
            {(x.draft.trim() || !voice.supported) && (
              <button type="submit" disabled={x.sending || !x.draft.trim()} aria-label="送出" className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-full bg-white text-ink transition-colors hover:bg-neon disabled:cursor-not-allowed disabled:opacity-40">
                <SendIcon className="h-5 w-5" />
              </button>
            )}
          </div>
          {(x.error || voice.error) && (
            <p role="alert" className="mt-2 px-4 text-xs font-bold text-[#ff9b9b]">{x.error ?? voice.error}</p>
          )}
          {!has && !x.error && !voice.error && <p className="mt-2 px-4 text-center text-[11px] text-white/50">請不要在對話中提供信用卡號或密碼</p>}
        </div>
      </form>
    </div>
  );
}
