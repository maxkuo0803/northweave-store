import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import type { ReturnStatus } from "@/generated/prisma/enums";
import { ReturnStatusBadge } from "@/components/StatusBadge";
import { RETURN_REASON_LABEL, RETURN_STATUS_LABEL, RETURN_TYPE_LABEL, formatDate } from "@/lib/store-config";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "退換貨管理" };

export default async function AdminReturns({ searchParams }: PageProps<"/admin/returns">) {
  const { status } = await searchParams;
  const st = typeof status === "string" && status in RETURN_STATUS_LABEL ? (status as ReturnStatus) : undefined;
  const returns = await prisma.returnRequest.findMany({
    where: st ? { status: st } : {},
    orderBy: { createdAt: "desc" },
    include: { user: { select: { name: true } }, order: { select: { orderNumber: true } }, _count: { select: { items: true } } },
  });

  return (
    <div>
      <h1 className="text-xl font-bold">退換貨管理</h1>
      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        <Link href="/admin/returns" className={cn("rounded-full border px-3 py-1", !st ? "border-brand bg-brand text-white" : "border-line bg-card")}>全部</Link>
        {(Object.keys(RETURN_STATUS_LABEL) as ReturnStatus[]).map((s) => (
          <Link key={s} href={`/admin/returns?status=${s}`} className={cn("rounded-full border px-3 py-1", st === s ? "border-brand bg-brand text-white" : "border-line bg-card")}>{RETURN_STATUS_LABEL[s]}</Link>
        ))}
      </div>
      <div className="card mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-xs text-muted">
            <tr><th className="p-3">RMA 編號</th><th>申請時間</th><th>顧客</th><th>訂單</th><th>類型</th><th>原因</th><th>狀態</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {returns.map((r) => (
              <tr key={r.id} className="hover:bg-sand/50">
                <td className="p-3"><Link href={`/admin/returns/${r.rmaNumber}`} className="font-mono text-brand underline">{r.rmaNumber}</Link></td>
                <td>{formatDate(r.createdAt, true)}</td>
                <td>{r.user.name}</td>
                <td className="font-mono text-xs">{r.order.orderNumber}</td>
                <td>{RETURN_TYPE_LABEL[r.type]}（{r._count.items} 項）</td>
                <td>{RETURN_REASON_LABEL[r.reason]}</td>
                <td><ReturnStatusBadge status={r.status} /></td>
              </tr>
            ))}
            {returns.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-muted">沒有資料</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
