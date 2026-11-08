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
    <div className="pegboard px-4 py-14">
      <div className="mx-auto grid max-w-3xl items-start gap-8 md:grid-cols-[1fr_260px]">
        <div className="card p-7">
          <h1 className="text-2xl font-black">註冊會員</h1>
          <p className="mt-1 text-sm text-muted">
            已經有帳號了？<Link href={`/login?next=${encodeURIComponent(nextPath)}`} className="font-bold text-ink underline decoration-2">登入</Link>
          </p>
          <div className="mt-6">
            <RegisterForm next={nextPath} />
          </div>
        </div>
        <div className="kraft-tag -rotate-2 p-5 text-sm">
          <p className="text-lg font-black">新會員優惠</p>
          <p className="mt-2 font-marker text-2xl">WELCOME100</p>
          <p className="mt-2">首購滿 NT$800 折 NT$100，結帳時輸入。</p>
        </div>
      </div>
    </div>
  );
}
