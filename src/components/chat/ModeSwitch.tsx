"use client";

import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { track } from "./ask";
import type { ShopMode } from "./XiaozhiProvider";
import { XiaozhiOrb } from "./XiaozhiOrb";

// 切換逛街模式：「小織帶逛」或「自己逛」。
// 寫 cookie 後重新整理伺服器畫面；選「小織帶逛」時直接回首頁，小織就站在那裡等你。
export function setShopMode(mode: ShopMode) {
  document.cookie = `nw_mode=${mode}; path=/; max-age=31536000; samesite=lax`;
  track("mode", mode);
  window.scrollTo({ top: 0 }); // 換了版面就從最上面開始看
}

export function ModeSwitch({ mode, className }: { mode: ShopMode; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const pick = (m: ShopMode) => {
    if (m === mode && (m === "browse" || pathname === "/")) return;
    setShopMode(m);
    if (m === "concierge" && pathname !== "/") router.push("/");
    else router.refresh();
  };
  return (
    <div role="radiogroup" aria-label="逛街方式" className={cn("flex shrink-0 items-center rounded-full bg-ink/[0.07] p-1 text-[13px] font-bold", className)}>
      {(
        [
          ["concierge", "小織帶逛"],
          ["browse", "自己逛"],
        ] as const
      ).map(([m, label]) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={mode === m}
          onClick={() => pick(m)}
          className={cn(
            "flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3 transition-colors",
            mode === m ? "bg-ink text-white shadow-sm" : "text-ink/70 hover:text-ink",
          )}
        >
          {m === "concierge" && <XiaozhiOrb className="h-4 w-4" />}
          {label}
        </button>
      ))}
    </div>
  );
}

// 傳統首頁上的「讓小織帶你逛」按鈕
export function ConciergeButton({ className }: { className?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        setShopMode("concierge");
        router.refresh();
      }}
      className={cn("group inline-flex cursor-pointer items-center gap-3 rounded-full bg-ink py-1.5 pr-5 pl-1.5 text-[15px] font-bold text-white transition-colors hover:bg-black", className)}
    >
      <XiaozhiOrb className="h-9 w-9" />
      不想自己找？讓小織帶你逛
    </button>
  );
}
