import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { OrderStatusBadge, ReturnStatusBadge } from "@/components/StatusBadge";
import {
  ORDER_STATUS_LABEL, PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL, RETURN_TYPE_LABEL, SHIPPING_METHOD_LABEL, formatDate, formatPrice,
} from "@/lib/store-config";
import { adminCancelOrderAction, advanceOrderAction } from "../../actions";

export const metadata: Metadata = { title: "訂單詳情" };

const NEXT_LABEL: Record<string, string> = { PAID: "開始備貨", PROCESSING: "出貨", SHIPPED: "標記為已送達", DELIVERED: "標記為已完成" };

export default async function AdminOrderDetail({ params }: PageProps<"/admin/orders/[orderNumber]">) {
  await requireStaff(); // 每一頁都要自己檢查權限：layout 在換頁時不一定會重跑
  const { orderNumber } = await params;
  const order = await prisma.order.findUnique({
    where: { orderNumber },
    include: { user: true, items: true, history: { orderBy: { createdAt: "asc" } }, returnRequests: true },
  });
  if (!order) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/admin/orders" className="text-sm text-muted">← 訂單管理</Link>
        <h1 className="font-mono text-xl font-bold">{order.orderNumber}</h1>
        <OrderStatusBadge status={order.status} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="font-bold">商品</h2>
            <table className="mt-3 w-full text-sm">
              <tbody className="divide-y divide-line">
                {order.items.map((it) => (
                  <tr key={it.id}>
                    <td className="py-2">{it.productName}<br /><span className="font-mono text-xs text-muted">{it.sku}</span></td>
                    <td>{it.color} / {it.size}</td>
                    <td>{formatPrice(it.unitPrice)} × {it.quantity}</td>
                    <td className="text-right">{formatPrice(it.unitPrice * it.quantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 space-y-1 border-t border-line pt-3 text-right text-sm">
              <p>小計 {formatPrice(order.subtotal)}</p>
              {order.discount > 0 && <p className="text-accent">折扣 {order.couponCode} -{formatPrice(order.discount)}</p>}
              <p>運費 {formatPrice(order.shippingFee)}</p>
              <p className="text-base font-bold">總計 {formatPrice(order.total)}</p>
            </div>
          </section>
          <section className="card p-5">
            <h2 className="font-bold">狀態歷程</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {order.history.map((h) => (
                <li key={h.id} className="flex gap-3"><span className="w-36 shrink-0 text-muted">{formatDate(h.createdAt, true)}</span><span className="font-medium">{ORDER_STATUS_LABEL[h.status]}</span><span className="text-muted">{h.note}</span></li>
              ))}
            </ul>
          </section>
          {order.returnRequests.length > 0 && (
            <section className="card p-5">
              <h2 className="font-bold">退換貨</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {order.returnRequests.map((r) => (
                  <li key={r.id}><Link href={`/admin/returns/${r.rmaNumber}`} className="flex gap-3 hover:text-brand"><span className="font-mono">{r.rmaNumber}</span>{RETURN_TYPE_LABEL[r.type]}<ReturnStatusBadge status={r.status} /></Link></li>
                ))}
              </ul>
            </section>
          )}
        </div>
        <aside className="space-y-4 text-sm">
          <div className="card space-y-1 p-5">
            <h2 className="mb-2 font-bold">顧客</h2>
            <p>{order.user.name}（{order.user.email}）</p>
            <p className="text-muted">收件：{order.recipientName} {order.recipientPhone}</p>
            <p className="text-muted">{SHIPPING_METHOD_LABEL[order.shippingMethod]}：{order.shippingAddress}</p>
            <p className="text-muted">付款：{PAYMENT_METHOD_LABEL[order.paymentMethod]}・{PAYMENT_STATUS_LABEL[order.paymentStatus]}</p>
            {order.trackingNumber && <p className="text-muted">物流單號：{order.carrier} {order.trackingNumber}</p>}
            {order.note && <p className="rounded bg-warn/10 p-2">顧客備註：{order.note}</p>}
          </div>
          <div className="card space-y-3 p-5">
            <h2 className="font-bold">處理訂單</h2>
            {NEXT_LABEL[order.status] ? (
              <form action={advanceOrderAction} className="space-y-2">
                <input type="hidden" name="id" value={order.id} />
                {order.status === "PROCESSING" && <input name="trackingNumber" required placeholder="物流單號" className="input" />}
                <input name="note" placeholder="備註（選填，顧客看得到）" className="input" />
                <button className="btn-primary w-full">{NEXT_LABEL[order.status]}</button>
              </form>
            ) : (
              <p className="text-muted">{order.status === "PENDING_PAYMENT" ? "等待顧客付款" : "此訂單沒有下一步"}</p>
            )}
            {["PENDING_PAYMENT", "PAID", "PROCESSING"].includes(order.status) && (
              <form action={adminCancelOrderAction} className="space-y-2 border-t border-line pt-3">
                <input type="hidden" name="id" value={order.id} />
                <input name="note" placeholder="取消原因（例如：商品缺貨）" className="input" />
                <button className="btn-danger w-full">取消訂單並歸還庫存</button>
              </form>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
