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
    <div className="mx-auto max-w-sm px-4 py-14">
      <h1 className="text-2xl font-bold">會員登入</h1>
      <p className="mt-1 text-sm text-muted">
        還沒有帳號？<Link href={`/register?next=${encodeURIComponent(nextPath)}`} className="text-brand underline">立即註冊</Link>
      </p>
      <div className="card mt-6 p-6">
        <LoginForm next={nextPath} />
      </div>
      <div className="mt-6 rounded-xl border border-dashed border-line p-4 text-xs text-muted">
        <p className="font-medium text-ink">作品集 Demo 帳號</p>
        <p className="mt-1">會員：demo@northweave.test ／ Demo1234!</p>
        <p>管理員：admin@northweave.test ／ Admin1234!</p>
      </div>
    </div>
  );
}
