"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { track, type AskDetail } from "./ask";
import type { Msg } from "./parts";

// 小織的「大腦」：整個網站共用同一份對話。
// - 首頁的「小織帶你逛」舞台、其他頁面的浮動小織，看到的都是同一串對話
// - 送訊息、輪詢真人客服回覆、朗讀回覆，都集中在這裡，畫面元件只管長相

export type ShopMode = "concierge" | "browse";

type SendOptions = { voice?: boolean }; // voice = 這句是用說的（小織就會用說的回答）

type XiaozhiCtx = {
  messages: Msg[];
  status: string; // AI / WAITING_HUMAN / HUMAN
  sending: boolean;
  progress: string | null; // 小織正在做什麼（「找商品中…」）
  error: string | null;
  setError: (e: string | null) => void;
  send: (text: string, opts?: SendOptions) => void;
  onAdded: (note: Msg) => void; // 卡片上直接加入購物車後
  open: boolean; // 浮動對話框（非首頁）是否打開
  setOpen: (v: boolean) => void;
  attachStage: () => () => void; // 首頁舞台掛上來時呼叫：對話直接在舞台上進行
  speakReplies: boolean; // 朗讀開關
  setSpeakReplies: (v: boolean) => void;
  speaking: boolean;
  stopSpeaking: () => void;
  mode: ShopMode;
  siteOrigin: string;
  draft: string; // 輸入框內容（舞台和對話框共用，切換時不會不見）
  setDraft: (v: string) => void;
};

const Ctx = createContext<XiaozhiCtx | null>(null);

export function useXiaozhi() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useXiaozhi 必須放在 <XiaozhiProvider> 裡面");
  return c;
}

const lsGet = (k: string) => { try { return window.localStorage.getItem(k); } catch { return null; } };
const lsSet = (k: string, v: string) => { try { window.localStorage.setItem(k, v); } catch { /* 無痕模式 */ } };

// 朗讀前把網址拿掉（念網址很吵）
const speakable = (t: string) => t.replace(/https?:\/\/\S+/g, "").replace(/[*#>`]/g, "").trim();

export function XiaozhiProvider({ children, mode, siteOrigin }: { children: React.ReactNode; mode: ShopMode; siteOrigin: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [status, setStatus] = useState("AI");
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpenState] = useState(false);
  const [stages, setStages] = useState(0);
  const [draft, setDraft] = useState("");
  const [speakReplies, setSpeakState] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const lastAt = useRef<string | null>(null);
  const stagesRef = useRef(0);
  const speakNext = useRef(false);

  // 朗讀開關記在瀏覽器裡（下次來還是一樣）
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 只在載入時讀一次瀏覽器設定
    setSpeakState(lsGet("nw_speak") === "1");
  }, []);
  const setSpeakReplies = useCallback((v: boolean) => {
    setSpeakState(v);
    lsSet("nw_speak", v ? "1" : "0");
    if (!v) window.speechSynthesis?.cancel();
  }, []);

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, []);

  const speak = useCallback((text: string) => {
    const synth = window.speechSynthesis;
    const t = speakable(text);
    if (!synth || !t) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(t);
    u.lang = "zh-TW";
    u.rate = 1.05;
    const voice = synth.getVoices().find((v) => v.lang === "zh-TW") ?? synth.getVoices().find((v) => v.lang.startsWith("zh"));
    if (voice) u.voice = voice;
    u.onstart = () => setSpeaking(true);
    u.onend = u.onerror = () => setSpeaking(false);
    synth.speak(u);
  }, []);

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

  // 對話看得到的時候（對話框打開、或首頁舞台在畫面上），每 4 秒問一次有沒有新訊息
  const visible = open || stages > 0;
  useEffect(() => {
    if (!visible) return;
    poll();
    const t = setInterval(poll, 4000);
    return () => clearInterval(t);
  }, [visible, poll]);

  const setOpen = useCallback((v: boolean) => {
    setOpenState(v);
    if (!v) window.speechSynthesis?.cancel();
  }, []);

  const attachStage = useCallback(() => {
    stagesRef.current += 1;
    setStages((n) => n + 1);
    return () => {
      stagesRef.current -= 1;
      setStages((n) => n - 1);
    };
  }, []);

  const sendingRef = useRef(false);
  const send = useCallback(
    async (text: string, opts?: SendOptions) => {
      const t = text.trim();
      if (!t || sendingRef.current) return;
      sendingRef.current = true;
      speakNext.current = !!opts?.voice;
      window.speechSynthesis?.cancel();
      setError(null);
      setDraft("");
      setSending(true);
      // 先把自己的話顯示出來（樂觀更新），伺服器回來再換成正式的
      const temp: Msg = { id: `temp-${Date.now()}`, role: "CUSTOMER", content: t, createdAt: new Date().toISOString() };
      setMessages((m) => [...m, temp]);
      try {
        // 串流：伺服器每做一步就傳一行回來（例如「找商品中…」），最後才傳完整回覆
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
          body: JSON.stringify({ text: t, path: window.location.pathname }),
        });
        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => ({}));
          setMessages((m) => m.filter((x) => x.id !== temp.id));
          setError(data.error ?? "傳送失敗，請再試一次");
          setDraft(t);
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
        // 用說的問 → 用說的答（像 Siri）；或顧客打開了朗讀
        const reply = done.messages.filter((m) => m.role === "AI").map((m) => m.content).join("\n");
        if (reply && (speakNext.current || lsGet("nw_speak") === "1")) speak(reply);
        // 小織幫忙加了購物車 / 下了單 → 重新整理（右上角購物車數量會更新）
        if (done.messages.some((m) => m.attachments?.refresh)) router.refresh();
      } catch {
        setMessages((m) => m.filter((x) => x.id !== temp.id));
        setError("網路好像斷了，請再試一次");
        setDraft(t);
      } finally {
        sendingRef.current = false;
        setSending(false);
        setProgress(null);
      }
    },
    [merge, router, speak],
  );

  // 網站其他地方叫小織（商品頁的「問小織」、搜尋找不到、購物車…）
  // 首頁舞台在畫面上 → 直接在舞台上問；否則打開浮動對話框
  useEffect(() => {
    const onAsk = (e: Event) => {
      const d = (e as CustomEvent<AskDetail>).detail;
      if (stagesRef.current === 0) setOpen(true);
      track("open", d.source);
      if (d.text) setTimeout(() => send(d.text!), 50);
    };
    window.addEventListener("nw:ask", onAsk);
    return () => window.removeEventListener("nw:ask", onAsk);
  }, [send, setOpen]);

  // 換頁時停止朗讀
  useEffect(() => () => window.speechSynthesis?.cancel(), [pathname]);

  const onAdded = useCallback((note: Msg) => {
    merge([note]);
    router.refresh();
  }, [merge, router]);

  const value = useMemo<XiaozhiCtx>(
    () => ({ messages, status, sending, progress, error, setError, send, onAdded, open, setOpen, attachStage, speakReplies, setSpeakReplies, speaking, stopSpeaking, mode, siteOrigin, draft, setDraft }),
    [messages, status, sending, progress, error, send, onAdded, open, setOpen, attachStage, speakReplies, setSpeakReplies, speaking, stopSpeaking, mode, siteOrigin, draft],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
