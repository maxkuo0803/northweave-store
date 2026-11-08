"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { APIError } from "better-auth/api";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { isDemoEmail } from "@/lib/store-config";
import { TOO_MANY, rateLimit } from "@/lib/rate-limit";

const DEMO_LOCKED = "這是公開的展示帳號，不能修改個人資料和密碼（自己註冊一個帳號就可以試）";

export type ActionState = { ok?: string; error?: string } | undefined;

export async function updateProfileAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (isDemoEmail(user.email)) return { error: DEMO_LOCKED };
  const parsed = z
    .object({
      name: z.string().trim().min(1, "請輸入姓名").max(40),
      phone: z.string().trim().regex(/^09\d{8}$/, "手機號碼格式為 09 開頭共 10 碼").or(z.literal("")),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await auth.api.updateUser({ body: { name: parsed.data.name, phone: parsed.data.phone || null }, headers: await headers() });
  revalidatePath("/", "layout");
  return { ok: "已更新個人資料" };
}

export async function changePasswordAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (isDemoEmail(user.email)) return { error: DEMO_LOCKED };
  if (!(await rateLimit(`password:${user.id}`, 5, 300))) return { error: TOO_MANY };
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  if (newPassword.length < 8 || newPassword.length > 128) return { error: "新密碼需要 8～128 個字元" };
  if (newPassword !== formData.get("confirm")) return { error: "兩次輸入的新密碼不一致" };
  try {
    await auth.api.changePassword({ body: { currentPassword, newPassword, revokeOtherSessions: true }, headers: await headers() });
  } catch (e) {
    if (e instanceof APIError) return { error: "目前密碼錯誤" };
    throw e;
  }
  return { ok: "密碼已更新，其他裝置已自動登出" };
}

const addressSchema = z.object({
  recipientName: z.string().trim().min(1, "請輸入收件人").max(40),
  phone: z.string().trim().regex(/^09\d{8}$/, "手機號碼格式為 09 開頭共 10 碼"),
  zipCode: z.string().trim().regex(/^\d{3}(\d{2,3})?$/, "郵遞區號為 3 或 5～6 碼數字"),
  city: z.string().trim().min(1, "請選擇縣市").max(10),
  district: z.string().trim().min(1, "請輸入鄉鎮市區").max(20),
  line: z.string().trim().min(3, "請輸入詳細地址").max(120),
});

export async function addAddressAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = addressSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  // 一個帳號最多 10 筆地址，避免被灌爆
  if ((await prisma.address.count({ where: { userId: user.id } })) >= 10) return { error: "最多只能存 10 筆地址" };
  const isDefault = formData.get("isDefault") === "on" || (await prisma.address.count({ where: { userId: user.id } })) === 0;
  await prisma.$transaction(async (tx) => {
    if (isDefault) await tx.address.updateMany({ where: { userId: user.id }, data: { isDefault: false } });
    await tx.address.create({ data: { ...parsed.data, userId: user.id, isDefault } });
  });
  revalidatePath("/account/addresses");
  return { ok: "已新增地址" };
}

export async function deleteAddressAction(formData: FormData) {
  const user = await requireUser();
  // where 同時帶 userId：確保只能刪自己的地址（防止改 id 刪別人的）
  await prisma.address.deleteMany({ where: { id: String(formData.get("id")), userId: user.id } });
  revalidatePath("/account/addresses");
}

export async function setDefaultAddressAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id"));
  await prisma.$transaction([
    prisma.address.updateMany({ where: { userId: user.id }, data: { isDefault: false } }),
    prisma.address.updateMany({ where: { id, userId: user.id }, data: { isDefault: true } }),
  ]);
  revalidatePath("/account/addresses");
}
