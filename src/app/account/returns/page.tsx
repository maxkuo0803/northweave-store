import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { ReturnStatusBadge } from "@/components/StatusBadge";
import { RETURN_REASON_LABEL, RETURN_TYPE_LABEL, formatDate } from "@/lib/store-config";

export const metadata: Metadata = { title: "退換貨紀錄" };

export default async function ReturnsPage() {
  const user = await requireUser("/account/returns");
  const returns = await prisma.returnRequest.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: { order: { select: { orderNumber: true } }, items: { include: { orderItem: true } } },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold">退換貨紀錄</h1>
      <p className="mt-1 text-sm text-muted">要申請新的退換貨，請到「我的訂單」選擇已送達的訂單。</p>
      {returns.length === 0 && <p className="mt-6 text-muted">沒有退換貨紀錄。</p>}
      <ul className="mt-6 space-y-3">
        {returns.map((r) => (
          <li key={r.id}>
            <Link href={`/account/returns/${r.rmaNumber}`} className="card block p-5 text-sm hover:border-ink/30">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-medium">{r.rmaNumber}</span>
                <span className="badge bg-sand">{RETURN_TYPE_LABEL[r.type]}</span>
                <ReturnStatusBadge status={r.status} />
                <span className="ml-auto text-muted">{formatDate(r.createdAt)}</span>
              </div>
              <p className="mt-2 text-muted">訂單 {r.order.orderNumber}・{RETURN_REASON_LABEL[r.reason]}・{r.items.map((i) => `${i.orderItem.productName} × ${i.quantity}`).join("、")}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
