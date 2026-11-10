"use client";

import { useEffect } from "react";
import { useXiaozhi } from "@/components/chat/XiaozhiProvider";
import { XiaozhiSurface } from "@/components/chat/XiaozhiSurface";
import { setShopMode } from "@/components/chat/ModeSwitch";
import { useRouter } from "next/navigation";

// 首頁「小織帶你逛」：一進門，店員小織就站在中間問你想找什麼。
// 跟傳統電商不一樣：不用自己翻分類、篩選，說出需求（打字或用說的），小織把衣服拿到你面前，
// 尺寸、顏色、加入購物車、結帳都在對話裡完成。想自己逛，右上角按「自己逛」就回到一般首頁。

type Featured = { code: string; name: string; price: number; salePrice: number | null; image: string };

const QUICK = [
  { label: "幫我挑一套約會穿搭", text: "推薦適合約會穿的衣服" },
  { label: "下雨天的外套", text: "下雨天穿的外套有推薦嗎？" },
  { label: "上班也能穿", text: "推薦上班也能穿的衣服" },
  { label: "送禮推薦", text: "想送朋友禮物，預算 1500 左右有什麼推薦？" },
  { label: "我的訂單到哪了", text: "我的訂單到哪了？" },
  { label: "運費、退換貨", text: "運費怎麼算？退換貨規則是什麼？" },
];

export function Concierge({ featured }: { featured: Featured[] }) {
  const x = useXiaozhi();
  const router = useRouter();
  // 舞台掛上來 → 告訴大腦「對話在這裡進行」（開始收真人客服的回覆、不再彈浮動視窗）
  const { attachStage } = x;
  useEffect(() => attachStage(), [attachStage]);

  const browse = () => {
    setShopMode("browse");
    router.refresh();
  };

  return (
    <section aria-label="小織帶你逛" className="relative isolate -mb-24 min-h-[calc(100svh-150px)] overflow-clip bg-ink md:min-h-[calc(100svh-102px)]">
      {/* overflow-clip（不是 hidden）：輸入列才能黏在畫面底部；-mb-24 蓋掉頁尾上方的留白 */}
      {/* 背景：很淡的洞洞板 + 光球後面的一團暖光 */}
      <span aria-hidden className="concierge-board pointer-events-none absolute inset-0 -z-10" />
      <span aria-hidden className="pointer-events-none absolute top-[-12%] left-1/2 -z-10 h-[60vh] w-[min(900px,120vw)] -translate-x-1/2 rounded-full bg-neon/[0.07] blur-3xl" />

      <div className="container-x">
        <XiaozhiSurface
          size="stage"
          greeting="歡迎光臨，今天想找什麼？"
          sub="我是店員小織。說出你的場合、預算或喜歡的感覺，我把適合的衣服拿給你看；尺寸、加入購物車、結帳也都可以交給我。"
          quick={QUICK}
          topExtra={
            <button type="button" onClick={browse} className="hidden min-h-11 cursor-pointer items-center rounded-full border border-white/25 px-4 text-sm font-bold text-white/85 transition-colors hover:border-white hover:text-white sm:inline-flex">
              我想自己逛
            </button>
          }
          emptyExtra={
            featured.length > 0 && (
              <div className="mt-14 w-full">
                <p className="text-sm font-bold text-white/60">或者，從今天掛出來的開始聊</p>
                <ul className="mt-4 grid grid-cols-3 gap-3 md:gap-4">
                  {featured.map((p) => (
                    <li key={p.code}>
                      <button
                        type="button"
                        onClick={() => x.send(`介紹一下 ${p.code}，適合怎麼穿？`)}
                        className="group block w-full cursor-pointer rounded-card bg-white/[0.06] p-3 text-left transition-colors hover:bg-white/[0.11] md:p-4"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.image} alt="" className="mx-auto aspect-square w-full max-w-36 object-contain drop-shadow-[0_14px_14px_rgb(0_0_0/.4)] transition-transform duration-500 ease-[var(--ease-out-soft)] group-hover:-translate-y-1.5" />
                        <span className="mt-2 block font-mono text-[11px] text-white/55">{p.code}</span>
                        <span className="block truncate text-sm font-bold text-white">{p.name}</span>
                        <span className="mt-0.5 block font-mono text-sm text-white/80 tabular-nums">
                          {(p.salePrice ?? p.price).toLocaleString()}
                          {p.salePrice != null && <span className="ml-1.5 text-[11px] text-white/45 line-through">{p.price.toLocaleString()}</span>}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                <button type="button" onClick={browse} className="mt-8 min-h-11 cursor-pointer text-sm font-bold text-white/70 underline decoration-white/30 underline-offset-4 hover:text-white hover:decoration-white sm:hidden">
                  我想自己逛
                </button>
              </div>
            )
          }
        />
      </div>
    </section>
  );
}
