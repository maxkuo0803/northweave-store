import Link from "next/link";
import { STORE } from "@/lib/store-config";

// 頁尾像攤位收攤後拉下的鐵捲門：深灰底、白字
export function Footer() {
  return (
    <footer
      className="mt-20 bg-rail text-white"
      style={{ backgroundImage: "repeating-linear-gradient(180deg, rgb(255 255 255 / .06) 0 2px, transparent 2px 14px)" }}
    >
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 text-sm sm:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <p className="text-2xl font-black tracking-[0.12em]">北織</p>
          <p className="mt-1 text-xs font-bold tracking-[0.3em] text-white/70">NORTHWEAVE</p>
          <p className="mt-4 max-w-xs leading-relaxed text-white/80">{STORE.tagline}。</p>
          <p className="mt-6 max-w-sm text-xs leading-relaxed text-white/65">
            這是作品集用的虛構品牌。商品、會員、訂單、評論都是程式產生的假資料，不會出貨，也不會收款。
          </p>
        </div>
        <div>
          <p className="font-bold">顧客服務</p>
          <ul className="mt-3 space-y-2 text-white/80">
            <li><Link href="/faq" className="hover:text-white hover:underline">常見問題</Link></li>
            <li><Link href="/faq#退換貨" className="hover:text-white hover:underline">退換貨規則</Link></li>
            <li><Link href="/faq#運送" className="hover:text-white hover:underline">運費與配送</Link></li>
            <li><Link href="/account/orders" className="hover:text-white hover:underline">查訂單</Link></li>
          </ul>
        </div>
        <div>
          <p className="font-bold">聯絡我們</p>
          <ul className="mt-3 space-y-2 text-white/80">
            <li>{STORE.servicePhone}</li>
            <li>{STORE.serviceEmail}</li>
            <li>{STORE.serviceHours}</li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
