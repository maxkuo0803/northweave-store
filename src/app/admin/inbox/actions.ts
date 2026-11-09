"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { pollGmail, staffReply } from "@/lib/channels/inbound";
import { saveAndDeliver } from "@/lib/channels/dispatch";
import { redactPII } from "@/lib/agent/guard";

type State = { ok?: string; error?: string } | undefined;

// 公開的「展示店員」帳號誰都能登入，所以不能讓它回覆真實的 LINE / Gmail 顧客。
// 只有真正的 admin，或設定 ALLOW_STAFF_EXTERNAL_REPLY=true 時，店員才能回外部平台。
function canReplyExternally(role: string | null | undefined) {
  return role === "admin" || process.env.ALLOW_STAFF_EXTERNAL_REPLY === "true";
}

export async function staffReplyAction(_: State, formData: FormData): Promise<State> {
  const staff = await requireStaff();
  const parsed = z.object({ id: z.string(), text: z.string().trim().min(1).max(2000) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "請輸入回覆內容（2000 字以內）" };
  const conv = await prisma.conversation.findUnique({ where: { id: parsed.data.id } });
  if (!conv) return { error: "找不到對話" };
  if (conv.channel !== "WEB" && !canReplyExternally(staff.role)) return { error: "展示店員帳號不能回覆 LINE / Email 顧客，請用管理員帳號" };

  // 人工回覆 = 自動接手（AI 暫停），避免 AI 跟真人同時回
  await prisma.conversation.update({ where: { id: conv.id }, data: { status: "HUMAN", staffUnread: false } });
  const msg = await staffReply(conv.id, staff.id, redactPII(parsed.data.text).text);
  revalidatePath(`/admin/inbox/${conv.id}`);
  if (msg.delivery === "FAILED") return { error: `已存檔，但送到 ${conv.channel} 失敗：${msg.deliveryError}` };
  return { ok: `已透過 ${{ WEB: "網站", LINE: "LINE", EMAIL: "Email" }[conv.channel]} 送出` };
}

const idOf = (fd: FormData) => String(fd.get("id"));

export async function takeOverAction(formData: FormData) {
  const staff = await requireStaff();
  const id = idOf(formData);
  const conv = await prisma.conversation.update({ where: { id }, data: { status: "HUMAN", staffUnread: false } });
  if (conv.channel === "WEB" || canReplyExternally(staff.role)) await saveAndDeliver(id, "SYSTEM", "真人客服已加入對話。");
  revalidatePath("/admin/inbox", "layout");
}

export async function returnToAiAction(formData: FormData) {
  await requireStaff();
  const id = idOf(formData);
  await prisma.conversation.update({ where: { id }, data: { status: "AI", handoffReason: null, staffUnread: false } });
  revalidatePath("/admin/inbox", "layout");
}

export async function closeConversationAction(formData: FormData) {
  await requireStaff();
  await prisma.conversation.update({ where: { id: idOf(formData) }, data: { status: "CLOSED", staffUnread: false } });
  revalidatePath("/admin/inbox", "layout");
}

export async function markReadAction(formData: FormData) {
  await requireStaff();
  await prisma.conversation.update({ where: { id: idOf(formData) }, data: { staffUnread: false } });
  revalidatePath("/admin/inbox", "layout");
}

export async function pollGmailAction(): Promise<State> {
  const staff = await requireStaff();
  if (!canReplyExternally(staff.role)) return { error: "展示店員帳號不能收發 Email" };
  try {
    const r = await pollGmail();
    revalidatePath("/admin/inbox");
    return r.ok ? { ok: `收到 ${r.fetched} 封，AI 處理 ${r.handled} 封` } : { error: r.error };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "收信失敗" };
  }
}
