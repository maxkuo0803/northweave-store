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
    <div className="mx-auto max-w-sm px-4 py-14">
      <h1 className="text-2xl font-bold">註冊會員</h1>
      <p className="mt-1 text-sm text-muted">
        已經有帳號了？<Link href={`/login?next=${encodeURIComponent(nextPath)}`} className="text-brand underline">登入</Link>
      </p>
      <div className="card mt-6 p-6">
        <RegisterForm next={nextPath} />
      </div>
      <p className="mt-4 text-xs text-muted">新會員可使用優惠碼 WELCOME100，首購滿 NT$800 折 NT$100。</p>
    </div>
  );
}
