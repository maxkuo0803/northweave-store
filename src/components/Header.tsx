import Link from "next/link";
import Form from "next/form";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { STORE } from "@/lib/store-config";

const NAV = [
  { href: "/products?category=men", label: "男裝" },
  { href: "/products?category=women", label: "女裝" },
  { href: "/products?category=accessories", label: "配件" },
  { href: "/products?sale=1", label: "特價" },
  { href: "/faq", label: "客服中心" },
];

export async function Header() {
  const session = await getSession();
  const cartCount = session
    ? (await prisma.cartItem.aggregate({ where: { userId: session.user.id }, _sum: { quantity: true } }))._sum.quantity ?? 0
    : 0;

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/95 backdrop-blur">
      <div className="bg-brand px-4 py-1.5 text-center text-xs text-white">全館滿 NT$1,500 免運・7 天鑑賞期退換貨</div>
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <Link href="/" className="shrink-0 text-lg font-bold tracking-widest">
          NORTHWEAVE <span className="text-sm font-normal tracking-normal text-muted">{STORE.shortName}</span>
        </Link>
        <nav className="hidden gap-5 text-sm md:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="hover:text-brand">
              {n.label}
            </Link>
          ))}
        </nav>
        <Form action="/products" className="ml-auto hidden w-56 sm:block">
          <input name="q" placeholder="搜尋商品" className="input rounded-full" aria-label="搜尋商品" />
        </Form>
        <div className="ml-auto flex items-center gap-4 text-sm sm:ml-0">
          {session ? (
            <>
              {session.user.role === "admin" && (
                <Link href="/admin" className="hidden rounded-full bg-ink px-3 py-1 text-xs text-white sm:inline">
                  後台
                </Link>
              )}
              <Link href="/account" className="hover:text-brand">
                {session.user.name}
              </Link>
            </>
          ) : (
            <Link href="/login" className="hover:text-brand">
              登入 / 註冊
            </Link>
          )}
          <Link href="/cart" className="relative hover:text-brand" aria-label={`購物車，${cartCount} 件商品`}>
            購物車
            {cartCount > 0 && (
              <span className="absolute -top-2 -right-4 grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[11px] text-white">
                {cartCount}
              </span>
            )}
          </Link>
        </div>
      </div>
      <nav className="flex gap-4 overflow-x-auto px-4 pb-2 text-sm md:hidden">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className="shrink-0 hover:text-brand">
            {n.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
