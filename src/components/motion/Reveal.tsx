"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * 捲動進場：元素捲到畫面裡時，從下方淡入浮上來。
 * - 伺服器先輸出「看得到」的內容（沒有 JS 或還沒載入也能看）
 * - 載入後，只有還在畫面外的元素才會先藏起來，等捲到再出現（不會閃一下）
 * - 使用者設定「減少動態效果」時，CSS 會直接顯示，不做動畫
 */
export function Reveal({
  children,
  className,
  delay = 0,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  as?: "div" | "section" | "li" | "article";
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // 已經在畫面裡的就不藏，直接顯示
    if (rect.top < window.innerHeight * 0.92) return;
    el.classList.add("reveal");
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.setAttribute("data-shown", "");
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag ref={ref as never} className={cn(className)} style={delay ? ({ "--delay": `${delay}ms` } as React.CSSProperties) : undefined}>
      {children}
    </Tag>
  );
}
