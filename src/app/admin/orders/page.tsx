import type { Metadata } from "next";
import Link from "next/link";
import Form from "next/form";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { OrderStatus } from "@/generated/prisma/enums";
import { OrderStatusBadge } from "@/components/StatusBadge";
import { ORDER_STATUS_LABEL, PAYMENT_METHOD_LABEL, SHIPPING_METHOD_LABEL, formatDate, formatPrice } from "@/lib/store-config";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "訂單管理" };

export default async function AdminOrders({ searchParams }: PageProps<"/admin/orders">) {
  const { status, q, page } = await searchParams;
  const st = typeof status === "string" && status in ORDER_STATUS_LABEL ? (status as OrderStatus) : undefined;
  const query = typeof q === "string" ? q.trim() : "";
  const p = Math.max(1, Number(page) || 1);
  const where: Prisma.OrderWhereInput = {
    ...(st && { status: st }),
    ...(query && { OR: [{ orderNumber: { contains: query } }, { recipientName: { contains: query } }, { recipientPhone: { contains: query } }, { user: { email: { contains: query } } }] }),
  };
  const [total, orders] = await prisma.$transaction([
    prisma.order.count({ where }),
    prisma.order.findMany({ where, orderBy: { placedAt: "desc" }, skip: (p - 1) * 20, take: 20, include: { user: { select: { name: true, email: true } } } }),
  ]);
  const pages = Math.ceil(total / 20);
  const link = (patch: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries({ status: st, q: query || undefined, ...patch })) if (v) sp.set(k, v);
    return `/admin/orders?${sp}`;
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">訂單管理（{total}）</h1>
        <Form action="/admin/orders" className="ml-auto flex gap-2">
          {st && <input type="hidden" name="status" value={st} />}
          <input name="q" defaultValue={query} placeholder="訂單編號 / 姓名 / 電話 / Email" className="input w-64" />
          <button className="btn-outline">搜尋</button>
        </Form>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        <Link href={link({ status: undefined })} className={cn("rounded-sm border px-3 py-1", !st ? "border-brand bg-brand text-white" : "border-line bg-card")}>全部</Link>
        {(Object.keys(ORDER_STATUS_LABEL) as OrderStatus[]).map((s) => (
          <Link key={s} href={link({ status: s })} className={cn("rounded-sm border px-3 py-1", st === s ? "border-brand bg-brand text-white" : "border-line bg-card")}>{ORDER_STATUS_LABEL[s]}</Link>
        ))}
      </div>
      <div className="card mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-xs text-muted">
            <tr><th className="p-3">訂單編號</th><th>下單時間</th><th>會員</th><th>金額</th><th>付款</th><th>配送</th><th>狀態</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {orders.map((o) => (
              <tr key={o.id} className="hover:bg-sand/50">
                <td className="p-3"><Link href={`/admin/orders/${o.orderNumber}`} className="font-mono text-brand underline">{o.orderNumber}</Link></td>
                <td>{formatDate(o.placedAt, true)}</td>
                <td>{o.user.name}<br /><span className="text-xs text-muted">{o.user.email}</span></td>
                <td>{formatPrice(o.total)}</td>
                <td>{PAYMENT_METHOD_LABEL[o.paymentMethod]}</td>
                <td>{SHIPPING_METHOD_LABEL[o.shippingMethod]}</td>
                <td><OrderStatusBadge status={o.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="mt-4 flex gap-2 text-sm">
          {p > 1 && <Link href={link({ page: String(p - 1) })} className="btn-outline">上一頁</Link>}
          <span className="self-center text-muted">第 {p} / {pages} 頁</span>
          {p < pages && <Link href={link({ page: String(p + 1) })} className="btn-outline">下一頁</Link>}
        </div>
      )}
    </div>
  );
}
