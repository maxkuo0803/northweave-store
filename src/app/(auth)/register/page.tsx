import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { safePath } from "@/lib/utils";
import { RegisterForm } from "../AuthForms";

export const metadata: Metadata = { title: "註冊會員" };

export default async function RegisterPage({ searchParams }: PageProps<"/register">) {
  const { next } = await searchParams;
  const nextPath = safePath(next);
  if (await getSession()) redirect(nextPath);

  return (
    <div className="pegboard px-4 py-16 md:py-24">
      <div className="mx-auto grid max-w-4xl items-start gap-6 md:grid-cols-[1fr_280px]">
        <div className="card p-8 md:p-10">
          <h1 className="display text-4xl">註冊會員</h1>
          <p className="mt-2 text-sm text-muted">
            已經有帳號了？<Link href={`/login?next=${encodeURIComponent(nextPath)}`} className="font-bold text-ink underline underline-offset-4">登入</Link>
          </p>
          <div className="mt-8">
            <RegisterForm next={nextPath} />
          </div>
        </div>
        <div className="kraft-tag p-6 text-sm">
          <p className="display text-xl">新會員優惠</p>
          <p className="mt-3 rounded-sm border border-dashed border-ink/40 px-3 py-2 text-center font-mono text-xl font-semibold tracking-wider">WELCOME100</p>
          <p className="mt-3">首購滿 NT$800 折 NT$100，結帳時輸入。</p>
        </div>
      </div>
    </div>
  );
}
