import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { OrderStatusBadge } from "@/components/StatusBadge";
import { ORDER_STATUS_LABEL, formatDate, formatPrice } from "@/lib/store-config";
import type { OrderStatus } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "後台總覽" };

function daysAgo(n: number) {
  return new Date(Date.now() - n * 24 * 3600 * 1000);
}

export default async function AdminHome() {
  await requireStaff(); // 每一頁都要自己檢查權限：layout 在換頁時不一定會重跑
  const since = daysAgo(30);
  const [revenue, byStatus, pendingReturns, lowStock, recent, newUsers] = await Promise.all([
    prisma.order.aggregate({ where: { placedAt: { gte: since }, status: { not: "CANCELLED" } }, _sum: { total: true }, _count: true }),
    prisma.order.groupBy({ by: ["status"], _count: true }),
    prisma.returnRequest.count({ where: { status: "REQUESTED" } }),
    prisma.productVariant.findMany({ where: { stock: { lte: 2 }, product: { status: "ACTIVE" } }, include: { product: true }, orderBy: { stock: "asc" }, take: 8 }),
    prisma.order.findMany({ orderBy: { placedAt: "desc" }, take: 8, include: { user: { select: { name: true } } } }),
    prisma.user.count({ where: { createdAt: { gte: since } } }),
  ]);
  const count = (s: OrderStatus) => byStatus.find((b) => b.status === s)?._count ?? 0;

  const kpis = [
    { label: "近 30 天營收", value: formatPrice(revenue._sum.total ?? 0) },
    { label: "近 30 天訂單", value: revenue._count },
    { label: "平均客單價", value: formatPrice(revenue._count ? Math.round((revenue._sum.total ?? 0) / revenue._count) : 0) },
    { label: "近 30 天新會員", value: newUsers },
  ];
  const todo = [
    { label: "待出貨（已付款 + 備貨中）", value: count("PAID") + count("PROCESSING"), href: "/admin/orders?status=PAID" },
    { label: "待審核退換貨", value: pendingReturns, href: "/admin/returns?status=REQUESTED" },
    { label: "待付款", value: count("PENDING_PAYMENT"), href: "/admin/orders?status=PENDING_PAYMENT" },
  ];

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="card p-5">
            <p className="text-xs text-muted">{k.label}</p>
            <p className="mt-1 text-2xl font-bold">{k.value}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {todo.map((t) => (
          <Link key={t.label} href={t.href} className="card flex items-center justify-between p-5 hover:border-ink/30">
            <span className="text-sm">{t.label}</span>
            <span className="text-2xl font-bold text-accent">{t.value}</span>
          </Link>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="font-bold">最新訂單</h2>
          <ul className="mt-3 divide-y divide-line text-sm">
            {recent.map((o) => (
              <li key={o.id}>
                <Link href={`/admin/orders/${o.orderNumber}`} className="flex items-center gap-3 py-2.5 hover:text-brand">
                  <span className="font-mono text-xs">{o.orderNumber}</span>
                  <span>{o.user.name}</span>
                  <OrderStatusBadge status={o.status} />
                  <span className="ml-auto">{formatPrice(o.total)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <section className="card p-5">
          <h2 className="font-bold">庫存警示（≤ 2 件）</h2>
          <ul className="mt-3 divide-y divide-line text-sm">
            {lowStock.map((v) => (
              <li key={v.id}>
                <Link href={`/admin/products/${v.productId}`} className="flex items-center gap-3 py-2.5 hover:text-brand">
                  <span className="flex-1">{v.product.name}・{v.color} / {v.size}</span>
                  <span className={v.stock === 0 ? "font-bold text-bad" : "text-warn"}>{v.stock === 0 ? "缺貨" : `剩 ${v.stock}`}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <section className="card p-5 text-sm">
        <h2 className="font-bold">訂單狀態分佈</h2>
        <div className="mt-3 flex flex-wrap gap-4">
          {(Object.keys(ORDER_STATUS_LABEL) as OrderStatus[]).map((s) => (
            <Link key={s} href={`/admin/orders?status=${s}`} className="hover:text-brand">{ORDER_STATUS_LABEL[s]} <b>{count(s)}</b></Link>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">資料更新時間：{formatDate(new Date(), true)}</p>
      </section>
    </div>
  );
}
