import Link from "next/link";
import Form from "next/form";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { SHIPPING, RETURN_WINDOW_DAYS } from "@/lib/store-config";

const NAV = [
  { href: "/products?category=men", label: "男裝" },
  { href: "/products?category=women", label: "女裝" },
  { href: "/products?category=accessories", label: "配件" },
  { href: "/products?sale=1", label: "特價" },
  { href: "/faq", label: "客服" },
];

// 頁首是一條紅色攤位布條：店名、分類、搜尋、會員、購物車
export async function Header() {
  const session = await getSession();
  const cartCount = session
    ? (await prisma.cartItem.aggregate({ where: { userId: session.user.id }, _sum: { quantity: true } }))._sum.quantity ?? 0
    : 0;

  return (
    <header className="relative z-30">
      <p className="bg-neon px-4 py-1 text-center text-xs font-bold text-ink">
        滿 NT${SHIPPING.freeThreshold.toLocaleString()} 免運　·　收到後 {RETURN_WINDOW_DAYS} 天內可退換<span className="hidden sm:inline">　·　作品集虛構品牌，不會真的出貨</span>
      </p>
      <div
        className="relative bg-banner text-white"
        style={{ backgroundImage: "repeating-linear-gradient(0deg, rgb(0 0 0 / .05) 0 1px, transparent 1px 3px), repeating-linear-gradient(90deg, rgb(255 255 255 / .04) 0 1px, transparent 1px 3px)" }}
      >
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3 md:py-4">
          <Link href="/" className="flex shrink-0 items-baseline gap-2 leading-none" aria-label="北織 NORTHWEAVE 首頁">
            <span className="text-3xl font-black tracking-[0.12em] md:text-4xl">北織</span>
            <span className="hidden text-[11px] font-bold tracking-[0.3em] sm:inline">NORTHWEAVE</span>
          </Link>
          <nav className="hidden gap-5 text-[15px] font-bold md:flex">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="decoration-2 hover:underline">
                {n.label}
              </Link>
            ))}
          </nav>
          <Form action="/products" className="ml-auto hidden w-52 lg:block">
            <input
              name="q"
              placeholder="搜尋商品或編號 NW001"
              aria-label="搜尋商品"
              className="w-full rounded-full border-0 bg-white/95 px-4 py-1.5 text-sm text-ink outline-none placeholder:text-muted focus:bg-white focus:ring-2 focus:ring-neon"
            />
          </Form>
          <div className="ml-auto flex items-center gap-4 text-sm font-bold lg:ml-0">
            {session ? (
              <>
                {(session.user.role === "admin" || session.user.role === "staff") && (
                  <Link href="/admin" className="hidden rounded-sm bg-ink px-2 py-1 text-xs sm:inline">
                    後台
                  </Link>
                )}
                <Link href="/account" className="max-w-24 truncate hover:underline">
                  {session.user.name}
                </Link>
              </>
            ) : (
              <Link href="/login" className="hover:underline">
                登入
              </Link>
            )}
            <Link href="/cart" className="flex items-center gap-1.5 hover:underline" aria-label={`購物車，${cartCount} 件商品`}>
              購物車
              <span className="kraft-tag grid h-6 min-w-6 place-items-center px-1 font-marker text-sm leading-none text-ink">{cartCount}</span>
            </Link>
          </div>
        </div>
        <nav className="flex gap-5 overflow-x-auto px-4 pb-2.5 text-sm font-bold md:hidden">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="shrink-0">
              {n.label}
            </Link>
          ))}
        </nav>
        {/* 布條下緣的扇形收邊 */}
        <div
          aria-hidden
          className="absolute inset-x-0 -bottom-2.5 h-2.5"
          style={{ background: "radial-gradient(circle at 10px 0, var(--color-banner) 9px, transparent 9.5px)", backgroundSize: "20px 10px" }}
        />
      </div>
    </header>
  );
}
