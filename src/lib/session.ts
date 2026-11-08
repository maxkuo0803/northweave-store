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

// 後台角色：
// - admin：真正的管理員，什麼都能做（密碼只有站長知道，不公開）
// - staff：公開給面試官試用的「展示店員」，可以處理訂單和退換貨，但不能改商品內容
const STAFF_ROLES = ["admin", "staff"];

// 進後台、處理訂單 / 退換貨：admin 或 staff
export async function requireStaff() {
  const session = await getSession();
  if (!session) redirect("/login?next=/admin");
  if (!STAFF_ROLES.includes(session.user.role ?? "")) redirect("/");
  return session.user;
}

// 只有真正的管理員能做的事（例如修改商品）
export async function requireAdmin() {
  const user = await requireStaff();
  if (user.role !== "admin") redirect("/admin");
  return user;
}
