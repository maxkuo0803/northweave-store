"use client";

import { useActionState, useState, useTransition } from "react";
import { AddressFields } from "@/components/AddressFields";
import { PAYMENT_METHOD_LABEL, SHIPPING, SHIPPING_METHOD_LABEL, formatPrice } from "@/lib/store-config";
import { cn } from "@/lib/utils";
import { checkCouponAction, placeOrderAction } from "./actions";

type Line = { id: string; name: string; variant: string; quantity: number; lineTotal: number; imageUrl: string };
type Addr = { id: string; label: string; address: string; isDefault: boolean };

const CVS_STORES = ["台北101門市", "大安門市", "板橋新站門市", "中壢高鐵門市", "台中文心門市", "台南成大門市", "高雄巨蛋門市", "新竹站前門市"];

export function CheckoutForm({ lines, subtotal, addresses, user }: { lines: Line[]; subtotal: number; addresses: Addr[]; user: { name: string; phone: string } }) {
  const [state, action, pending] = useActionState(placeOrderAction, undefined);
  const [shipping, setShipping] = useState<"HOME" | "CVS">("HOME");
  const [payment, setPayment] = useState<"CREDIT_CARD" | "LINE_PAY" | "ATM" | "COD">("CREDIT_CARD");
  const [addressId, setAddressId] = useState(addresses[0]?.id ?? "new");
  const [code, setCode] = useState("");
  const [coupon, setCoupon] = useState<{ code: string; discount: number; description: string } | null>(null);
  const [couponMsg, setCouponMsg] = useState<string>();
  const [checking, startCheck] = useTransition();

  // 畫面上的金額只是預覽，真正的金額由伺服器在下單時重新計算
  const discount = coupon?.discount ?? 0;
  const fee = subtotal - discount >= SHIPPING.freeThreshold ? 0 : SHIPPING.fee[shipping];
  const total = subtotal - discount + fee;

  function applyCoupon() {
    startCheck(async () => {
      const r = await checkCouponAction(code, subtotal);
      if ("error" in r) { setCoupon(null); setCouponMsg(r.error); }
      else { setCoupon({ code: r.code, discount: r.discount!, description: r.description }); setCouponMsg(undefined); }
    });
  }

  const radio = (active: boolean) => cn("flex cursor-pointer items-start gap-3 rounded-2xl border p-4 text-sm", active ? "border-brand bg-brand/5" : "border-line bg-card");

  return (
    <form action={action} className="mt-6 grid gap-8 lg:grid-cols-[1fr_340px]">
      <div className="space-y-8">
        <section>
          <h2 className="mb-3 font-bold">1. 運送方式</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {(["HOME", "CVS"] as const).map((m) => (
              <label key={m} className={radio(shipping === m)}>
                <input type="radio" name="shippingMethod" value={m} checked={shipping === m} onChange={() => setShipping(m)} className="mt-1" />
                <span><span className="font-medium">{SHIPPING_METHOD_LABEL[m]}</span><br /><span className="text-muted">{SHIPPING.carriers[m]}・NT${SHIPPING.fee[m]}（滿 NT${SHIPPING.freeThreshold.toLocaleString()} 免運）</span></span>
              </label>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-3 font-bold">2. 收件資訊</h2>
          {shipping === "CVS" ? (
            <div className="card grid gap-3 p-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="label" htmlFor="cvsStore">取貨門市（模擬，實際會串接超商電子地圖）</label>
                <select id="cvsStore" name="cvsStore" className="input" required defaultValue="">
                  <option value="" disabled>請選擇門市</option>
                  {CVS_STORES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div><label className="label" htmlFor="cvsName">取件人姓名（需與證件相同）</label><input id="cvsName" name="cvsName" defaultValue={user.name} className="input" required /></div>
              <div><label className="label" htmlFor="cvsPhone">取件人手機</label><input id="cvsPhone" name="cvsPhone" defaultValue={user.phone} className="input" inputMode="numeric" required /></div>
            </div>
          ) : (
            <div className="space-y-3">
              {addresses.map((a) => (
                <label key={a.id} className={radio(addressId === a.id)}>
                  <input type="radio" name="addressId" value={a.id} checked={addressId === a.id} onChange={() => setAddressId(a.id)} className="mt-1" />
                  <span><span className="font-medium">{a.label}</span>{a.isDefault && <span className="badge ml-2 bg-brand/10 text-brand">預設</span>}<br /><span className="text-muted">{a.address}</span></span>
                </label>
              ))}
              <label className={radio(addressId === "new")}>
                <input type="radio" name="addressId" value="new" checked={addressId === "new"} onChange={() => setAddressId("new")} className="mt-1" />
                <span className="font-medium">使用新地址</span>
              </label>
              {addressId === "new" && (
                <div className="card space-y-3 p-5">
                  <AddressFields prefix="new_" defaultName={user.name} defaultPhone={user.phone} />
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="saveAddress" defaultChecked /> 儲存到我的地址</label>
                </div>
              )}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 font-bold">3. 付款方式</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {(["CREDIT_CARD", "LINE_PAY", "ATM", "COD"] as const).map((m) => (
              <label key={m} className={radio(payment === m)}>
                <input type="radio" name="paymentMethod" value={m} checked={payment === m} onChange={() => setPayment(m)} className="mt-1" />
                <span className="font-medium">{PAYMENT_METHOD_LABEL[m]}</span>
              </label>
            ))}
          </div>
          <p className="mt-3 rounded-sm bg-sand px-4 py-3 text-xs text-muted">
            {payment === "ATM" ? "下單後會產生虛擬帳號，請於 3 天內轉帳。（模擬，不會真的收款）" :
              payment === "COD" ? "商品送達時付款給物流人員。" :
              "作品集模擬金流：不需輸入卡號，送出後直接視為付款成功。正式上線會導向綠界 / 藍新等金流頁面。"}
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-bold">4. 備註</h2>
          <textarea name="note" maxLength={200} rows={2} className="input" placeholder="需要統一編號或其他備註請寫在這裡" />
        </section>
      </div>

      <aside className="card h-fit space-y-4 p-6 text-sm lg:sticky lg:top-28">
        <h2 className="font-bold">訂單摘要</h2>
        <ul className="space-y-3">
          {lines.map((l) => (
            <li key={l.id} className="flex gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={l.imageUrl} alt="" className="h-14 w-14 rounded-sm bg-sand" />
              <div className="flex-1"><p>{l.name}</p><p className="text-muted">{l.variant} × {l.quantity}</p></div>
              <p>{formatPrice(l.lineTotal)}</p>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="優惠碼" className="input" aria-label="優惠碼" />
          <button type="button" onClick={applyCoupon} disabled={!code || checking} className="btn-outline shrink-0 px-4">{checking ? "…" : "套用"}</button>
        </div>
        <input type="hidden" name="couponCode" value={coupon?.code ?? ""} />
        {couponMsg && <p className="text-bad">{couponMsg}</p>}
        {coupon && <p className="text-ok">已套用 {coupon.code}：{coupon.description} <button type="button" className="ml-1 underline" onClick={() => setCoupon(null)}>移除</button></p>}
        <div className="space-y-1 border-t border-line pt-3">
          <div className="flex justify-between"><span>商品小計</span><span>{formatPrice(subtotal)}</span></div>
          {discount > 0 && <div className="flex justify-between text-accent"><span>優惠折抵</span><span>-{formatPrice(discount)}</span></div>}
          <div className="flex justify-between"><span>運費</span><span>{fee === 0 ? "免運" : formatPrice(fee)}</span></div>
          <div className="flex justify-between pt-2 text-base font-bold"><span>總計</span><span>{formatPrice(total)}</span></div>
        </div>
        {state?.error && <p className="rounded-sm bg-bad/10 px-3 py-2 text-bad">{state.error}</p>}
        <button className="btn-mark w-full text-base" disabled={pending}>{pending ? "處理中…" : `確認下單 ${formatPrice(total)}`}</button>
        <p className="text-xs text-muted">下單即表示同意本站退換貨政策。這是作品集網站，不會真的出貨或收款。</p>
      </aside>
    </form>
  );
}
