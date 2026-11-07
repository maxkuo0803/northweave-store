import Link from "next/link";
import { STORE } from "@/lib/store-config";

export function Footer() {
  return (
    <footer className="mt-16 border-t border-line bg-sand">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm sm:grid-cols-3">
        <div>
          <p className="font-bold tracking-widest">NORTHWEAVE 北織</p>
          <p className="mt-2 text-muted">{STORE.tagline}</p>
          <p className="mt-4 text-xs text-muted">本網站為作品集展示用的虛構品牌，所有商品、會員、訂單皆為假資料，不會實際出貨或收款。</p>
        </div>
        <div>
          <p className="font-medium">顧客服務</p>
          <ul className="mt-2 space-y-1 text-muted">
            <li><Link href="/faq" className="hover:text-ink">常見問題</Link></li>
            <li><Link href="/faq#退換貨" className="hover:text-ink">退換貨政策</Link></li>
            <li><Link href="/faq#運送" className="hover:text-ink">運送說明</Link></li>
            <li><Link href="/account/orders" className="hover:text-ink">訂單查詢</Link></li>
          </ul>
        </div>
        <div>
          <p className="font-medium">聯絡我們</p>
          <ul className="mt-2 space-y-1 text-muted">
            <li>{STORE.servicePhone}</li>
            <li>{STORE.serviceEmail}</li>
            <li>{STORE.serviceHours}</li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
