import type { Metadata } from "next";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { getCart, quote } from "@/lib/pricing";
import { SHIPPING, formatPrice } from "@/lib/store-config";
import { removeCartItemAction, updateCartItemAction } from "./actions";

export const metadata: Metadata = { title: "購物車" };

export default async function CartPage() {
  const session = await getSession();
  if (!session) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <h1 className="text-2xl font-bold">購物車</h1>
        <p className="mt-3 text-muted">請先登入，購物車會保存在您的會員帳號中。</p>
        <Link href="/login?next=/cart" className="btn-primary mt-6">登入</Link>
      </div>
    );
  }
  const lines = await getCart(session.user.id);
  const q = await quote(lines, "HOME");
  const gap = SHIPPING.freeThreshold - q.subtotal;
  const blocked = lines.some((l) => !l.available);

  if (lines.length === 0) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <h1 className="text-2xl font-bold">購物車是空的</h1>
        <Link href="/products" className="btn-primary mt-6">去逛逛</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-bold">購物車</h1>
      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_320px]">
        <ul className="divide-y divide-line">
          {lines.map((l) => (
            <li key={l.id} className="flex gap-4 py-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={l.imageUrl} alt="" className="h-24 w-24 rounded-sm bg-sand" />
              <div className="flex-1 text-sm">
                <Link href={`/products/${l.slug}`} className="font-medium hover:text-brand">{l.productName}</Link>
                <p className="mt-1 text-muted">{l.color} / {l.size}</p>
                <p className="mt-1">{formatPrice(l.unitPrice)}{l.unitPrice < l.originalPrice && <span className="ml-2 text-muted line-through">{formatPrice(l.originalPrice)}</span>}</p>
                {!l.available && <p className="mt-1 text-bad">{l.stock === 0 ? "已售完，請移除" : `庫存只剩 ${l.stock} 件，請調整數量`}</p>}
                <div className="mt-2 flex items-center gap-3">
                  <form action={updateCartItemAction} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={l.id} />
                    <select name="quantity" defaultValue={l.quantity} className="input w-20 py-1" aria-label="數量">
                      {Array.from({ length: Math.max(l.quantity, Math.min(10, l.stock)) }, (_, i) => i + 1).map((n) => <option key={n}>{n}</option>)}
                    </select>
                    <button className="text-brand underline">更新</button>
                  </form>
                  <form action={removeCartItemAction}>
                    <input type="hidden" name="id" value={l.id} />
                    <button className="text-muted underline">移除</button>
                  </form>
                </div>
              </div>
              <p className="text-sm font-medium">{formatPrice(l.lineTotal)}</p>
            </li>
          ))}
        </ul>
        <aside className="card h-fit space-y-3 p-6 text-sm">
          <div className="flex justify-between"><span>商品小計</span><span>{formatPrice(q.subtotal)}</span></div>
          <p className="text-muted">{gap > 0 ? `再買 ${formatPrice(gap)} 即可免運` : "已達免運門檻 🎉"}</p>
          <div className="h-2 overflow-hidden rounded-full bg-sand">
            <div className="h-full bg-brand" style={{ width: `${Math.min(100, (q.subtotal / SHIPPING.freeThreshold) * 100)}%` }} />
          </div>
          <p className="text-xs text-muted">運費與優惠碼在下一步結帳時計算</p>
          {blocked ? (
            <button className="btn-primary w-full" disabled>請先處理庫存不足的商品</button>
          ) : (
            <Link href="/checkout" className="btn-mark w-full text-base">前往結帳</Link>
          )}
        </aside>
      </div>
    </div>
  );
}
