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
    <div className="pegboard px-4 py-14">
      <div className="mx-auto grid max-w-3xl items-start gap-8 md:grid-cols-[1fr_260px]">
        <div className="card p-7">
          <h1 className="text-2xl font-black">會員登入</h1>
          <p className="mt-1 text-sm text-muted">
            還沒有帳號？<Link href={`/register?next=${encodeURIComponent(nextPath)}`} className="font-bold text-ink underline decoration-2">註冊一個</Link>
          </p>
          <div className="mt-6">
            <LoginForm next={nextPath} />
          </div>
        </div>
        <div className="neon-card rotate-2 p-5 text-sm">
          <p className="text-lg font-black">作品集試用帳號</p>
          <p className="mt-3 font-bold">會員</p>
          <p>demo@northweave.test</p>
          <p className="font-marker">Demo1234!</p>
          <p className="mt-3 font-bold">管理員（可進後台）</p>
          <p>admin@northweave.test</p>
          <p className="font-marker">Admin1234!</p>
        </div>
      </div>
    </div>
  );
}
