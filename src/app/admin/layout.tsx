import Link from "next/link";
import { requireAdmin } from "@/lib/session";

const LINKS = [
  { href: "/admin", label: "總覽" },
  { href: "/admin/orders", label: "訂單管理" },
  { href: "/admin/returns", label: "退換貨" },
  { href: "/admin/products", label: "商品與庫存" },
  { href: "/admin/customers", label: "會員" },
];

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdmin();
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center gap-4 border-b border-line pb-4">
        <p className="font-bold">管理後台</p>
        <nav className="flex gap-1 overflow-x-auto text-sm">
          {LINKS.map((l) => <Link key={l.href} href={l.href} className="shrink-0 rounded-sm px-3 py-1.5 hover:bg-sand">{l.label}</Link>)}
        </nav>
      </div>
      {children}
    </div>
  );
}
