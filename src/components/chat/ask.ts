"use client";

// 網站任何地方都能「叫小織過來」：發一個瀏覽器事件，右下角的聊天視窗收到後就打開。
// 這樣商品頁、搜尋頁、購物車…不用知道聊天視窗怎麼實作，只要呼叫 askXiaozhi() 就好。

export type AskDetail = {
  text?: string; // 有的話：打開後直接幫顧客問這句
  source: string; // 從哪個入口來的（統計用）：product-chip、search-empty、cart…
};
export type HintDetail = {
  key: string; // 同一個提示一次瀏覽只出現一次
  message: string; // 小織說的話
  short: string; // 窄螢幕用的一行短句
  askLabel: string; // 按鈕字
  askText: string; // 按下去幫顧客問的話
  source: string;
};

export const askXiaozhi = (detail: AskDetail) => window.dispatchEvent(new CustomEvent<AskDetail>("nw:ask", { detail }));
export const hintXiaozhi = (detail: HintDetail) => window.dispatchEvent(new CustomEvent<HintDetail>("nw:hint", { detail }));

// 使用統計：送一筆事件到伺服器（不影響畫面，失敗也沒關係）
export function track(type: string, source?: string) {
  try {
    const body = JSON.stringify({ type, source, path: location.pathname });
    if (!navigator.sendBeacon?.("/api/chat/event", new Blob([body], { type: "application/json" }))) {
      fetch("/api/chat/event", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
    }
  } catch {
    /* 統計失敗不影響使用 */
  }
}
