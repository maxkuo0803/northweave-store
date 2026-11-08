import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { OrderStatusBadge } from "@/components/StatusBadge";
import { formatDate, formatPrice } from "@/lib/store-config";

export const metadata: Metadata = { title: "會員中心" };

export default async function AccountPage() {
  const user = await requireUser();
  const [orders, counts, openReturns, wishCount] = await Promise.all([
    prisma.order.findMany({ where: { userId: user.id }, orderBy: { placedAt: "desc" }, take: 3 }),
    prisma.order.groupBy({ by: ["status"], where: { userId: user.id }, _count: true }),
    prisma.returnRequest.count({ where: { userId: user.id, status: { in: ["REQUESTED", "APPROVED", "RECEIVED"] } } }),
    prisma.wishlistItem.count({ where: { userId: user.id } }),
  ]);
  const c = (s: string[]) => counts.filter((x) => s.includes(x.status)).reduce((n, x) => n + x._count, 0);
  const stats = [
    { label: "待付款", value: c(["PENDING_PAYMENT"]), href: "/account/orders" },
    { label: "處理中", value: c(["PAID", "PROCESSING"]), href: "/account/orders" },
    { label: "配送中", value: c(["SHIPPED"]), href: "/account/orders" },
    { label: "退換貨處理中", value: openReturns, href: "/account/returns" },
    { label: "收藏", value: wishCount, href: "/account/wishlist" },
  ];

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">會員總覽</h1>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="card p-4 text-center hover:border-ink/30">
            <p className="text-2xl font-bold">{s.value}</p>
            <p className="mt-1 text-xs text-muted">{s.label}</p>
          </Link>
        ))}
      </div>
      <section>
        <div className="mb-3 flex items-end justify-between">
          <h2 className="font-bold">最近訂單</h2>
          <Link href="/account/orders" className="text-sm text-brand underline">全部訂單</Link>
        </div>
        <ul className="divide-y divide-line rounded-sm border border-line bg-card">
          {orders.map((o) => (
            <li key={o.id}>
              <Link href={`/account/orders/${o.orderNumber}`} className="flex flex-wrap items-center gap-3 px-5 py-4 text-sm hover:bg-sand/50">
                <span className="font-medium">{o.orderNumber}</span>
                <OrderStatusBadge status={o.status} />
                <span className="text-muted">{formatDate(o.placedAt)}</span>
                <span className="ml-auto">{formatPrice(o.total)}</span>
              </Link>
            </li>
          ))}
          {orders.length === 0 && <li className="px-5 py-4 text-sm text-muted">還沒有訂單</li>}
        </ul>
      </section>
    </div>
  );
}
