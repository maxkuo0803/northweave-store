"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { APIError } from "better-auth/api";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { safePath as safeNext } from "@/lib/utils";
import { TOO_MANY, clientIp, rateLimit } from "@/lib/rate-limit";

export type FormState = { error?: string; fieldErrors?: Record<string, string> } | undefined;

export async function signInAction(_: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "請輸入 Email 與密碼" };
  // 防暴力破解：同一個 IP 5 分鐘最多 20 次、同一個帳號 5 分鐘最多 10 次
  const ip = await clientIp();
  if (!(await rateLimit(`signin:ip:${ip}`, 20, 300)) || !(await rateLimit(`signin:email:${email.toLowerCase()}`, 10, 300))) {
    return { error: TOO_MANY };
  }
  try {
    await auth.api.signInEmail({ body: { email, password }, headers: await headers() });
  } catch (e) {
    if (e instanceof APIError) return { error: "Email 或密碼錯誤" };
    throw e;
  }
  redirect(safeNext(formData.get("next")));
}

const signUpSchema = z
  .object({
    name: z.string().trim().min(1, "請輸入姓名").max(40),
    email: z.email("Email 格式不正確"),
    phone: z.string().trim().regex(/^09\d{8}$/, "手機號碼格式為 09 開頭共 10 碼").or(z.literal("")),
    password: z.string().min(8, "密碼至少 8 個字元").max(128, "密碼最多 128 個字元"),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { path: ["confirm"], message: "兩次輸入的密碼不一致" });

export async function signUpAction(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = signUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { fieldErrors };
  }
  const { name, email, phone, password } = parsed.data;
  // 防止有人用程式大量註冊：同一個 IP 1 小時最多 5 個帳號
  if (!(await rateLimit(`signup:ip:${await clientIp()}`, 5, 3600))) return { error: TOO_MANY };
  try {
    await auth.api.signUpEmail({ body: { name, email, password, phone: phone || undefined }, headers: await headers() });
  } catch (e) {
    if (e instanceof APIError) {
      return e.body?.code === "USER_ALREADY_EXISTS" || e.status === "UNPROCESSABLE_ENTITY"
        ? { fieldErrors: { email: "這個 Email 已經註冊過了" } }
        : { error: "註冊失敗，請稍後再試" };
    }
    throw e;
  }
  redirect(safeNext(formData.get("next")));
}

export async function signOutAction() {
  await auth.api.signOut({ headers: await headers() });
  redirect("/");
}
