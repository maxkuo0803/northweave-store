import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { ReturnStatusBadge } from "@/components/StatusBadge";
import { RETURN_REASON_LABEL, RETURN_TYPE_LABEL, formatDate, formatPrice } from "@/lib/store-config";
import { completeReturnAction, receiveReturnAction, reviewReturnAction } from "../../actions";

export const metadata: Metadata = { title: "退換貨詳情" };

export default async function AdminReturnDetail({ params }: PageProps<"/admin/returns/[rmaNumber]">) {
  await requireStaff(); // 每一頁都要自己檢查權限：layout 在換頁時不一定會重跑
  const { rmaNumber } = await params;
  const r = await prisma.returnRequest.findUnique({
    where: { rmaNumber },
    include: { user: true, order: true, items: { include: { orderItem: true, exchangeVariant: true } } },
  });
  if (!r) notFound();
  const suggestedRefund = r.items.reduce((s, i) => s + i.orderItem.unitPrice * i.quantity, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/admin/returns" className="text-sm text-muted">← 退換貨管理</Link>
        <h1 className="font-mono text-xl font-bold">{r.rmaNumber}</h1>
        <span className="badge bg-sand">{RETURN_TYPE_LABEL[r.type]}</span>
        <ReturnStatusBadge status={r.status} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="card space-y-2 p-5 text-sm">
          <p><span className="text-muted">顧客：</span>{r.user.name}（{r.user.email}）</p>
          <p><span className="text-muted">訂單：</span><Link href={`/admin/orders/${r.order.orderNumber}`} className="font-mono text-brand underline">{r.order.orderNumber}</Link>・送達 {r.order.deliveredAt ? formatDate(r.order.deliveredAt) : "—"}</p>
          <p><span className="text-muted">申請時間：</span>{formatDate(r.createdAt, true)}</p>
          <p><span className="text-muted">原因：</span>{RETURN_REASON_LABEL[r.reason]}</p>
          {r.description && <p className="rounded bg-sand p-3">顧客說明：{r.description}</p>}
          {r.adminNote && <p className="rounded bg-warn/10 p-3">處理備註：{r.adminNote}</p>}
          {r.refundAmount !== null && <p><span className="text-muted">退款金額：</span>{formatPrice(r.refundAmount)}</p>}
          <table className="mt-3 w-full">
            <tbody className="divide-y divide-line">
              {r.items.map((i) => (
                <tr key={i.id}>
                  <td className="py-2">{i.orderItem.productName}<br /><span className="font-mono text-xs text-muted">{i.orderItem.sku}</span></td>
                  <td>{i.orderItem.color} / {i.orderItem.size} × {i.quantity}</td>
                  <td>{i.exchangeVariant ? `→ ${i.exchangeVariant.color} / ${i.exchangeVariant.size}（庫存 ${i.exchangeVariant.stock}）` : formatPrice(i.orderItem.unitPrice * i.quantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <aside className="card space-y-3 p-5 text-sm">
          <h2 className="font-bold">處理</h2>
          {r.status === "REQUESTED" && (
            <form action={reviewReturnAction} className="space-y-2">
              <input type="hidden" name="id" value={r.id} />
              <textarea name="adminNote" rows={2} placeholder="備註（拒絕時會顯示給顧客）" className="input" />
              <div className="flex gap-2">
                <button name="decision" value="approve" className="btn-primary flex-1">核准</button>
                <button name="decision" value="reject" className="btn-danger flex-1">拒絕</button>
              </div>
            </form>
          )}
          {r.status === "APPROVED" && (
            <form action={receiveReturnAction}>
              <input type="hidden" name="id" value={r.id} />
              <button className="btn-primary w-full">已收到退回商品（放回庫存）</button>
            </form>
          )}
          {r.status === "RECEIVED" && (
            <form action={completeReturnAction} className="space-y-2">
              <input type="hidden" name="id" value={r.id} />
              {r.type === "RETURN" ? (
                <>
                  <label className="label" htmlFor="refundAmount">退款金額（建議 {formatPrice(suggestedRefund)}）</label>
                  <input id="refundAmount" name="refundAmount" type="number" defaultValue={suggestedRefund} min={0} max={r.order.total} className="input" />
                  <button className="btn-primary w-full">確認退款</button>
                </>
              ) : (
                <button className="btn-primary w-full">寄出換貨商品（扣新 SKU 庫存）</button>
              )}
            </form>
          )}
          {["REFUNDED", "EXCHANGED", "REJECTED", "CANCELLED"].includes(r.status) && <p className="text-muted">此申請已結案</p>}
        </aside>
      </div>
    </div>
  );
}
