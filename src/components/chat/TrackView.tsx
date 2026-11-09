"use client";

import { useEffect } from "react";

// 商品頁載入時通知伺服器「看了這件」，推薦商品用（只送商品 ID）
export function TrackView({ productId }: { productId: string }) {
  useEffect(() => {
    fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId }), keepalive: true }).catch(() => {});
  }, [productId]);
  return null;
}
