import Link from "next/link";
import { STORE } from "@/lib/store-config";

const COLS = [
  {
    title: "逛逛",
    links: [
      ["女裝", "/products?category=women"],
      ["男裝", "/products?category=men"],
      ["配件", "/products?category=accessories"],
      ["特價", "/products?sale=1"],
    ],
  },
  {
    title: "顧客服務",
    links: [
      ["常見問題", "/faq"],
      ["退換貨規則", "/faq#退換貨"],
      ["運費與配送", "/faq#運送"],
      ["查訂單", "/account/orders"],
    ],
  },
];

// 頁尾：深色鐵捲門底 + 一行很大的店名
export function Footer() {
  return (
    <footer className="mt-24 overflow-hidden bg-rail text-white">
      <div className="container-x grid gap-12 pt-16 pb-10 text-sm md:grid-cols-[1.6fr_1fr_1fr_1.2fr]">
        <div>
          <p className="max-w-xs font-serif text-2xl leading-snug font-black">{STORE.tagline}。</p>
          <p className="mt-5 max-w-sm text-xs leading-relaxed text-white/60">
            這是作品集用的虛構品牌。商品、會員、訂單、評論都是程式產生的假資料，不會出貨，也不會收款。
          </p>
        </div>
        {COLS.map((c) => (
          <div key={c.title}>
            <p className="text-xs font-bold tracking-[0.2em] text-white/50">{c.title}</p>
            <ul className="mt-4 space-y-2.5">
              {c.links.map(([label, href]) => (
                <li key={href}>
                  <Link href={href} className="text-white/85 transition-colors hover:text-neon">{label}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div>
          <p className="text-xs font-bold tracking-[0.2em] text-white/50">聯絡我們</p>
          <ul className="mt-4 space-y-2.5 text-white/85">
            <li className="font-mono">{STORE.servicePhone}</li>
            <li>{STORE.serviceEmail}</li>
            <li>{STORE.serviceHours}</li>
          </ul>
        </div>
      </div>
      {/* 超大店名：用 SVG 讓字剛好撐滿寬度，底部被切掉一點，像招牌露出來 */}
      <div aria-hidden className="container-x -mb-[2.2%] select-none">
        <svg viewBox="0 0 1000 132" className="block w-full fill-white/[0.07]">
          <text x="0" y="128" textLength="1000" lengthAdjust="spacingAndGlyphs" className="font-serif" style={{ fontSize: 168, fontWeight: 900 }}>
            NORTHWEAVE
          </text>
        </svg>
      </div>
    </footer>
  );
}
