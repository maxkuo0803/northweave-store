import Link from "next/link";
import Form from "next/form";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PAYMENT_METHOD_LABEL, RETURN_WINDOW_DAYS, SHIPPING } from "@/lib/store-config";
import { Marquee } from "@/components/motion/Marquee";

const NAV = [
  { href: "/products?category=women", label: "女裝" },
  { href: "/products?category=men", label: "男裝" },
  { href: "/products?category=accessories", label: "配件" },
  { href: "/products?sale=1", label: "特價" },
  { href: "/faq", label: "客服" },
];

// 跑馬燈上的字：只寫真的規則（取自 store-config），不編造
const TICKER = [
  `滿 NT$${SHIPPING.freeThreshold.toLocaleString()} 免運`,
  `收到後 ${RETURN_WINDOW_DAYS} 天內可退換`,
  `超商取貨 NT$${SHIPPING.fee.CVS}・宅配 NT$${SHIPPING.fee.HOME}`,
  `${Object.values(PAYMENT_METHOD_LABEL).join("・")}`,
  "作品集虛構品牌，不會真的出貨",
];

// 頁面上方固定的導覽列：跑馬燈 + 店名印章 + 分類 + 搜尋 + 會員 + 購物車
export async function Header() {
  const session = await getSession();
  const cartCount = session
    ? (await prisma.cartItem.aggregate({ where: { userId: session.user.id }, _sum: { quantity: true } }))._sum.quantity ?? 0
    : 0;
  const isStaff = session?.user.role === "admin" || session?.user.role === "staff";

  return (
    <header className="sticky top-0 z-30">
      {/* LED 跑馬燈：黑底螢光字 */}
      <Marquee items={TICKER} className="bg-ink py-1.5 font-mono text-[12px] font-medium tracking-wider text-neon" />

      <div className="border-b border-line/80 bg-paper/85 backdrop-blur-md backdrop-saturate-150">
        <div className="container-x flex h-16 items-center gap-6 md:h-[72px]">
          <Link href="/" className="group flex shrink-0 items-center gap-3" aria-label="北織 NORTHWEAVE 首頁">
            {/* 紅色印章 */}
            <span className="grid h-10 w-10 place-items-center rounded-[9px] bg-mark font-serif text-[15px] leading-[1.05] font-black text-white shadow-[inset_0_0_0_2px_rgb(255_255_255/.22)] transition-transform duration-300 group-hover:-rotate-6">
              <span className="text-center">北<br />織</span>
            </span>
            <span className="hidden flex-col leading-none sm:flex">
              <span className="font-serif text-lg font-black tracking-[0.08em]">北織</span>
              <span className="mt-1 text-[10px] font-bold tracking-[0.32em] text-muted">NORTHWEAVE</span>
            </span>
          </Link>

          <nav aria-label="主選單" className="hidden items-center gap-1 text-[15px] font-bold md:flex">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="rounded-full px-3.5 py-2 transition-colors hover:bg-ink/[0.06]">
                {n.label}
              </Link>
            ))}
          </nav>

          <Form action="/products" className="relative ml-auto hidden w-64 lg:block">
            <svg aria-hidden viewBox="0 0 20 20" className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted">
              <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <path d="M13 13 L17 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <input
              name="q"
              placeholder="搜尋商品或編號 NW001"
              aria-label="搜尋商品"
              className="h-10 w-full rounded-full border border-ink/12 bg-white/80 pr-4 pl-10 text-sm outline-none transition-colors placeholder:text-muted/80 hover:border-ink/30 focus:border-ink focus:bg-white"
            />
          </Form>

          <div className="ml-auto flex items-center gap-1 text-sm font-bold lg:ml-0">
            {isStaff && (
              <Link href="/admin" className="mr-1 hidden rounded-full border border-ink/80 px-3 py-1.5 text-xs transition-colors hover:bg-ink hover:text-white sm:inline-flex">
                後台
              </Link>
            )}
            <Link
              href={session ? "/account" : "/login"}
              className="flex h-10 items-center gap-2 rounded-full px-3 transition-colors hover:bg-ink/[0.06]"
              aria-label={session ? `會員中心（${session.user.name}）` : "登入"}
            >
              <svg aria-hidden viewBox="0 0 20 20" className="h-5 w-5">
                <circle cx="10" cy="7" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
                <path d="M3.5 17.5 C4.5 13.5 7 12 10 12 C13 12 15.5 13.5 16.5 17.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
              <span className="hidden max-w-24 truncate sm:inline">{session ? session.user.name : "登入"}</span>
            </Link>
            <Link href="/cart" className="relative flex h-10 items-center gap-2 rounded-full px-3 transition-colors hover:bg-ink/[0.06]" aria-label={`購物車，${cartCount} 件商品`}>
              <svg aria-hidden viewBox="0 0 20 20" className="h-5 w-5">
                <path d="M4 7 H16 L15 17.5 H5 Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                <path d="M7 7 V5.5 a3 3 0 0 1 6 0 V7" fill="none" stroke="currentColor" strokeWidth="1.7" />
              </svg>
              <span className="hidden sm:inline">購物車</span>
              {cartCount > 0 && (
                <span className="absolute top-0.5 left-6 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-mark px-1 font-mono text-[11px] leading-none text-white sm:static sm:h-5 sm:min-w-5">
                  {cartCount}
                </span>
              )}
            </Link>
          </div>
        </div>

        {/* 手機版：分類橫向捲動 */}
        <nav aria-label="分類" className="flex gap-1 overflow-x-auto px-3 pb-2.5 text-sm font-bold [scrollbar-width:none] md:hidden">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="shrink-0 rounded-full bg-ink/[0.05] px-3.5 py-1.5">
              {n.label}
            </Link>
          ))}
          <Link href="/products" className="shrink-0 rounded-full bg-ink/[0.05] px-3.5 py-1.5">搜尋</Link>
        </nav>
      </div>
    </header>
  );
}
