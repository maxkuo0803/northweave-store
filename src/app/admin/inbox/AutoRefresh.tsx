"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// 每隔幾秒重新抓一次頁面資料（新訊息、AI 新步驟會自己出現）。
// 使用者正在打字時不刷新，避免輸入框被重設。
export function AutoRefresh({ seconds = 5 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      const el = document.activeElement;
      const typing = el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && el.value);
      if (!typing && document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
