"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

// 語音輸入：用瀏覽器內建的語音辨識（Chrome、Edge、Safari 都有，免費、不用 API Key）。
// Firefox 沒有 → supported = false，畫面就不顯示麥克風按鈕。
// 說話時 interim 會即時更新（像 Siri 一邊聽一邊把字打出來），停下來就把整句交給 onFinal。

// TypeScript 內建型別沒有語音辨識，自己定義用得到的部分
type Rec = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type RecCtor = new () => Rec;
const getCtor = (): RecCtor | undefined => {
  const w = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
};
const noop = () => () => {};

export function useDictation(onFinal: (text: string) => void) {
  const supported = useSyncExternalStore(noop, () => !!getCtor(), () => false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Rec | null>(null);
  const finalText = useRef("");
  const cb = useRef(onFinal);
  useEffect(() => {
    cb.current = onFinal;
  });

  const stop = useCallback(() => rec.current?.stop(), []);

  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor || rec.current) return;
    window.speechSynthesis?.cancel(); // 小織在說話時按麥克風 → 先讓她閉嘴
    const r = new Ctor();
    r.lang = "zh-TW";
    r.interimResults = true;
    r.continuous = false; // 一句話講完自動停（像 Siri）
    finalText.current = "";
    r.onresult = (e) => {
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalText.current += res[0].transcript;
        else live += res[0].transcript;
      }
      setInterim(finalText.current + live);
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") setError("沒有麥克風權限，請在瀏覽器網址列旁允許，或直接打字");
      else if (e.error === "no-speech") setError("沒聽到聲音，再按一次麥克風試試");
      else if (e.error !== "aborted") setError("語音辨識暫時不能用，請直接打字");
    };
    r.onend = () => {
      rec.current = null;
      setListening(false);
      setInterim("");
      const t = finalText.current.trim();
      if (t) cb.current(t);
    };
    setError(null);
    setInterim("");
    rec.current = r;
    setListening(true);
    try {
      r.start();
    } catch {
      rec.current = null;
      setListening(false);
    }
  }, []);

  // 離開頁面時關掉麥克風
  useEffect(() => () => rec.current?.abort(), []);

  return { supported, listening, interim, error, start, stop, clearError: () => setError(null) };
}
