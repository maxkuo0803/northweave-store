import Link from "next/link";
import { requireStaff } from "@/lib/session";
import { prisma } from "@/lib/prisma";

const LINKS = [
  { href: "/admin", label: "總覽" },
  { href: "/admin/inbox", label: "客服中心" },
  { href: "/admin/knowledge", label: "AI 知識庫" },
  { href: "/admin/orders", label: "訂單管理" },
  { href: "/admin/returns", label: "退換貨" },
  { href: "/admin/products", label: "商品與庫存" },
  { href: "/admin/customers", label: "會員" },
];

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireStaff();
  // 待人工接手的對話數，顯示在「客服中心」旁邊
  const waiting = await prisma.conversation.count({ where: { status: "WAITING_HUMAN" } });
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center gap-4 border-b border-line pb-4">
        <p className="font-bold">管理後台</p>
        <nav className="flex gap-1 overflow-x-auto text-sm">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="flex shrink-0 items-center gap-1.5 rounded-sm px-3 py-1.5 hover:bg-sand">
              {l.label}
              {l.href === "/admin/inbox" && waiting > 0 && <span className="rounded-sm bg-ink px-1.5 text-xs font-bold text-white">{waiting}</span>}
            </Link>
          ))}
        </nav>
      </div>
      {children}
    </div>
  );
}
