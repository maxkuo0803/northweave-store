import type { Metadata } from "next";
import Link from "next/link";
import Form from "next/form";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { formatDate, formatPrice } from "@/lib/store-config";

export const metadata: Metadata = { title: "會員管理" };

export default async function AdminCustomers({ searchParams }: PageProps<"/admin/customers">) {
  await requireStaff(); // 每一頁都要自己檢查權限：layout 在換頁時不一定會重跑
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim() : "";
  const users = await prisma.user.findMany({
    where: query ? { OR: [{ name: { contains: query } }, { email: { contains: query } }, { phone: { contains: query } }] } : {},
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { orders: true, returnRequests: true } } },
  });
  // 累計消費（不含取消的訂單）
  const spent = await prisma.order.groupBy({ by: ["userId"], where: { status: { not: "CANCELLED" } }, _sum: { total: true } });
  const spentMap = new Map(spent.map((s) => [s.userId, s._sum.total ?? 0]));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">會員（{users.length}）</h1>
        <Form action="/admin/customers" className="ml-auto flex gap-2">
          <input name="q" defaultValue={query} placeholder="姓名 / Email / 電話" className="input w-56" />
          <button className="btn-outline">搜尋</button>
        </Form>
      </div>
      <div className="card mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-xs text-muted">
            <tr><th className="p-3">姓名</th><th>Email</th><th>電話</th><th>註冊日</th><th>訂單數</th><th>累計消費</th><th>退換貨</th><th>角色</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-sand/50">
                <td className="p-3">{u.name}</td>
                <td><Link href={`/admin/orders?q=${encodeURIComponent(u.email)}`} className="text-brand underline">{u.email}</Link></td>
                <td>{u.phone}</td>
                <td>{formatDate(u.createdAt)}</td>
                <td>{u._count.orders}</td>
                <td>{formatPrice(spentMap.get(u.id) ?? 0)}</td>
                <td>{u._count.returnRequests}</td>
                <td>{u.role === "admin" ? <span className="badge bg-ink text-white">管理員</span> : u.role === "staff" ? <span className="badge">展示店員</span> : "會員"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
