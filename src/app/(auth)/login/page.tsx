import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { safePath } from "@/lib/utils";
import { LoginForm } from "../AuthForms";

export const metadata: Metadata = { title: "會員登入" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  const nextPath = safePath(next);
  if (await getSession()) redirect(nextPath);

  return (
    <div className="pegboard px-4 py-16 md:py-24">
      <div className="mx-auto grid max-w-4xl items-start gap-6 md:grid-cols-[1fr_280px]">
        <div className="card p-8 md:p-10">
          <h1 className="display text-4xl">會員登入</h1>
          <p className="mt-2 text-sm text-muted">
            還沒有帳號？<Link href={`/register?next=${encodeURIComponent(nextPath)}`} className="font-bold text-ink underline underline-offset-4">註冊一個</Link>
          </p>
          <div className="mt-8">
            <LoginForm next={nextPath} />
          </div>
        </div>
        <div className="neon-card p-6 text-sm">
          <p className="display text-xl">作品集試用帳號</p>
          <p className="mt-4 font-bold">會員</p>
          <p>demo@northweave.test</p>
          <p className="font-mono font-semibold">Demo1234!</p>
          <p className="mt-4 font-bold">店員（可進後台處理訂單）</p>
          <p>staff@northweave.test</p>
          <p className="font-mono font-semibold">Staff1234!</p>
          <p className="mt-4 border-t border-ink/15 pt-3 text-xs">試用帳號大家共用，不能改密碼。想試完整會員功能可以自己註冊。</p>
        </div>
      </div>
    </div>
  );
}
