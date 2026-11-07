import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";

// 同一個請求內多次呼叫只會查一次資料庫（React cache）
export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

// 需要登入的頁面 / Server Action 開頭呼叫，未登入就導去登入頁
export async function requireUser(returnTo = "/account") {
  const session = await getSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  return session.user;
}

export async function requireAdmin() {
  const session = await getSession();
  if (!session) redirect("/login?next=/admin");
  if (session.user.role !== "admin") redirect("/");
  return session.user;
}
