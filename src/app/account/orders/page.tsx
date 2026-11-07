import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { OrderStatusBadge } from "@/components/StatusBadge";
import { formatDate, formatPrice } from "@/lib/store-config";

export const metadata: Metadata = { title: "我的訂單" };

export default async function OrdersPage() {
  const user = await requireUser("/account/orders");
  const orders = await prisma.order.findMany({
    where: { userId: user.id },
    orderBy: { placedAt: "desc" },
    include: { items: { take: 3 }, _count: { select: { items: true } } },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold">我的訂單</h1>
      {orders.length === 0 && <p className="mt-6 text-muted">還沒有訂單。<Link href="/products" className="text-brand underline">去逛逛</Link></p>}
      <ul className="mt-6 space-y-4">
        {orders.map((o) => (
          <li key={o.id}>
            <Link href={`/account/orders/${o.orderNumber}`} className="card block p-5 hover:border-ink/30">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="font-medium">{o.orderNumber}</span>
                <OrderStatusBadge status={o.status} />
                <span className="text-muted">{formatDate(o.placedAt, true)}</span>
                <span className="ml-auto font-bold">{formatPrice(o.total)}</span>
              </div>
              <div className="mt-3 flex items-center gap-2">
                {o.items.map((it) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={it.id} src={it.imageUrl} alt={it.productName} className="h-14 w-14 rounded-lg bg-sand" />
                ))}
                {o._count.items > 3 && <span className="text-sm text-muted">+{o._count.items - 3}</span>}
                <span className="ml-2 text-sm text-muted">{o.items[0]?.productName}{o._count.items > 1 && ` 等 ${o._count.items} 件商品`}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
