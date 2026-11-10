import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { CANCELLABLE, getOrderForUser, returnEligibility, virtualAccount } from "@/lib/orders";
import { OrderStatusBadge, ReturnStatusBadge } from "@/components/StatusBadge";
import {
  ORDER_STATUS_LABEL, PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL, RETURN_TYPE_LABEL, SHIPPING_METHOD_LABEL, formatDate, formatPrice,
} from "@/lib/store-config";
import { cancelOrderAction, simulatePaymentAction } from "../actions";

export async function generateMetadata({ params }: PageProps<"/account/orders/[orderNumber]">): Promise<Metadata> {
  return { title: `訂單 ${(await params).orderNumber}` };
}

export default async function OrderDetailPage({ params, searchParams }: PageProps<"/account/orders/[orderNumber]">) {
  const { orderNumber } = await params;
  const { placed } = await searchParams;
  const user = await requireUser(`/account/orders/${orderNumber}`);
  const order = await getOrderForUser(orderNumber, user.id);
  if (!order) notFound();

  const eligible = returnEligibility(order);
  const atm = order.paymentMethod === "ATM" && order.status === "PENDING_PAYMENT" ? virtualAccount(order.orderNumber) : null;
  const atmDeadline = new Date(order.placedAt.getTime() + 3 * 24 * 3600 * 1000);

  return (
    <div className="space-y-6">
      {placed && (
        <div className="rounded-2xl bg-ok/10 p-5 text-ok">
          <p className="font-bold">訂單已成立，謝謝您的購買！</p>
          <p className="mt-1 text-sm">訂單確認信已寄到 {user.email}（模擬）</p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/account/orders" className="text-sm text-muted">← 我的訂單</Link>
        <h1 className="display text-3xl md:text-4xl">訂單 {order.orderNumber}</h1>
        <OrderStatusBadge status={order.status} />
      </div>

      {atm && (
        <div className="card border-warn/40 bg-warn/5 p-5 text-sm">
          <p className="font-bold">請於 {formatDate(atmDeadline, true)} 前完成 ATM 轉帳</p>
          <p className="mt-2">銀行：{atm.bank}　虛擬帳號：<span className="font-mono font-bold">{atm.account}</span>　金額：{formatPrice(order.total)}</p>
          <form action={simulatePaymentAction} className="mt-3">
            <input type="hidden" name="orderNumber" value={order.orderNumber} />
            <button className="btn-outline">模擬完成轉帳（Demo 用）</button>
          </form>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="font-bold">訂單進度</h2>
            <ol className="mt-4 space-y-4 border-l-2 border-line pl-5">
              {order.history.map((h) => (
                <li key={h.id} className="relative text-sm">
                  <span className="absolute top-1 -left-[27px] h-3 w-3 rounded-full border-2 border-paper bg-brand" />
                  <p className="font-medium">{ORDER_STATUS_LABEL[h.status]}</p>
                  {h.note && <p className="text-muted">{h.note}</p>}
                  <p className="text-xs text-muted">{formatDate(h.createdAt, true)}</p>
                </li>
              ))}
            </ol>
            {order.trackingNumber && (
              <p className="mt-4 rounded-sm bg-sand px-4 py-3 text-sm">物流：{order.carrier}　單號：<span className="font-mono">{order.trackingNumber}</span></p>
            )}
          </section>

          <section className="card p-5">
            <h2 className="font-bold">商品明細</h2>
            <ul className="mt-3 divide-y divide-line">
              {order.items.map((it) => (
                <li key={it.id} className="flex gap-4 py-3 text-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={it.imageUrl} alt="" className="h-16 w-16 rounded-sm bg-sand" />
                  <div className="flex-1">
                    {it.variant ? <Link href={`/products/${it.variant.product.slug}`} className="font-medium hover:text-brand">{it.productName}</Link> : <p className="font-medium">{it.productName}</p>}
                    <p className="text-muted">{it.color} / {it.size}・{it.sku}</p>
                    <p className="text-muted">{formatPrice(it.unitPrice)} × {it.quantity}</p>
                  </div>
                  <p>{formatPrice(it.unitPrice * it.quantity)}</p>
                </li>
              ))}
            </ul>
            <div className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
              <div className="flex justify-between"><span>商品小計</span><span>{formatPrice(order.subtotal)}</span></div>
              {order.discount > 0 && <div className="flex justify-between text-accent"><span>優惠折抵 {order.couponCode && `（${order.couponCode}）`}</span><span>-{formatPrice(order.discount)}</span></div>}
              <div className="flex justify-between"><span>運費</span><span>{order.shippingFee === 0 ? "免運" : formatPrice(order.shippingFee)}</span></div>
              <div className="flex justify-between text-base font-bold"><span>總計</span><span>{formatPrice(order.total)}</span></div>
            </div>
          </section>

          {order.returnRequests.length > 0 && (
            <section className="card p-5">
              <h2 className="font-bold">退換貨申請</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {order.returnRequests.map((r) => (
                  <li key={r.id}>
                    <Link href={`/account/returns/${r.rmaNumber}`} className="flex items-center gap-3 hover:text-brand">
                      <span className="font-medium">{r.rmaNumber}</span><span>{RETURN_TYPE_LABEL[r.type]}</span><ReturnStatusBadge status={r.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="space-y-4 text-sm">
          <div className="card space-y-1 p-5">
            <h2 className="mb-2 font-bold">付款與配送</h2>
            <p><span className="text-muted">下單時間：</span>{formatDate(order.placedAt, true)}</p>
            <p><span className="text-muted">付款方式：</span>{PAYMENT_METHOD_LABEL[order.paymentMethod]}</p>
            <p><span className="text-muted">付款狀態：</span>{PAYMENT_STATUS_LABEL[order.paymentStatus]}</p>
            <p><span className="text-muted">配送方式：</span>{SHIPPING_METHOD_LABEL[order.shippingMethod]}</p>
            <p><span className="text-muted">收件人：</span>{order.recipientName} {order.recipientPhone}</p>
            <p><span className="text-muted">地址：</span>{order.shippingAddress}</p>
            {order.note && <p><span className="text-muted">備註：</span>{order.note}</p>}
          </div>
          <div className="card space-y-3 p-5">
            {eligible.ok ? (
              <>
                <Link href={`/account/returns/new?order=${order.orderNumber}`} className="btn-primary w-full">申請退換貨</Link>
                <p className="text-xs text-muted">鑑賞期至 {formatDate(eligible.deadline)}</p>
              </>
            ) : (
              <p className="text-xs text-muted">退換貨：{eligible.reason}</p>
            )}
            {CANCELLABLE.includes(order.status) && (
              <form action={cancelOrderAction}>
                <input type="hidden" name="orderNumber" value={order.orderNumber} />
                <button className="btn-danger w-full">取消訂單</button>
              </form>
            )}
            <Link href="/faq" className="block text-center text-xs text-muted underline">有問題？查看常見問題</Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
