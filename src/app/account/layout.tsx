import Link from "next/link";
import { requireUser } from "@/lib/session";
import { signOutAction } from "../(auth)/actions";

const LINKS = [
  { href: "/account", label: "會員總覽" },
  { href: "/account/orders", label: "我的訂單" },
  { href: "/account/returns", label: "退換貨紀錄" },
  { href: "/account/wishlist", label: "我的收藏" },
  { href: "/account/addresses", label: "收件地址" },
  { href: "/account/profile", label: "個人資料" },
];

export default async function AccountLayout({ children }: LayoutProps<"/account">) {
  const user = await requireUser();
  return (
    <div className="container-x grid gap-10 py-10 md:grid-cols-[200px_1fr] md:py-14">
      <aside>
        <p className="text-sm text-muted">您好，</p>
        <p className="display text-2xl">{user.name}</p>
        <nav className="mt-4 flex gap-2 overflow-x-auto text-sm md:flex-col md:gap-1">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="shrink-0 rounded-full px-4 py-2 font-bold transition-colors hover:bg-ink/[0.06]">
              {l.label}
            </Link>
          ))}
        </nav>
        <form action={signOutAction} className="mt-4">
          <button className="px-3 text-sm text-muted underline hover:text-ink">登出</button>
        </form>
      </aside>
      <section className="min-w-0">{children}</section>
    </div>
  );
}
