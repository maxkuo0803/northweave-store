import "server-only";
import { prisma } from "@/lib/prisma";
import { ingestCustomerMessage } from "@/lib/agent/conversations";
import { respond } from "@/lib/agent/run";
import { saveAndDeliver } from "./dispatch";
import { lineProfileName, lineReply, type LineEvent } from "./line";
import { fetchUnreadEmails, gmailConfigured, markEmailRead } from "./gmail";

// 外部平台進來的訊息 → 存進對話 → 交給 AI 回覆（AI 處理不了會自動轉人工）

// ── LINE ──
const LINK_PREFIX = "channel-link:LINE:";

export async function handleLineEvent(ev: LineEvent) {
  const lineUserId = ev.source?.userId;
  if (!lineUserId) return;

  // 加好友：打招呼並說明怎麼綁定會員
  if (ev.type === "follow" && ev.replyToken) {
    await lineReply(ev.replyToken, "歡迎加入北織 NORTHWEAVE！我是 AI 客服小織，商品、運費、退換貨都可以問我。\n想查訂單的話，請先到網站「會員中心」取得綁定碼，再傳「綁定 123456」給我。").catch(() => {});
    return;
  }
  if (ev.type !== "message") return;
  if (ev.message?.type !== "text" || !ev.message.text) {
    if (ev.replyToken) await lineReply(ev.replyToken, "目前只看得懂文字訊息喔，請用文字描述你的問題 🙏").catch(() => {});
    return;
  }
  const text = ev.message.text.trim();

  // 綁定會員：「綁定 123456」
  const code = text.match(/^綁定\s*(\d{6})$/)?.[1];
  if (code) {
    const v = await prisma.verification.findFirst({ where: { identifier: LINK_PREFIX + code, expiresAt: { gt: new Date() } } });
    let reply = "綁定碼錯誤或已過期（10 分鐘內有效），請到網站會員中心重新產生。";
    if (v) {
      await prisma.$transaction([
        prisma.channelLink.upsert({
          where: { channel_externalId: { channel: "LINE", externalId: lineUserId } },
          create: { channel: "LINE", externalId: lineUserId, userId: v.value },
          update: { userId: v.value },
        }),
        prisma.verification.delete({ where: { id: v.id } }),
      ]);
      reply = "綁定成功！之後在 LINE 就能直接問我訂單進度和退換貨了。";
    }
    if (ev.replyToken) await lineReply(ev.replyToken, reply).catch(() => {});
    return;
  }

  const link = await prisma.channelLink.findUnique({ where: { channel_externalId: { channel: "LINE", externalId: lineUserId } } });
  const existing = await prisma.conversation.findUnique({ where: { channel_externalId: { channel: "LINE", externalId: lineUserId } }, select: { displayName: true } });
  const { conversation } = await ingestCustomerMessage({
    channel: "LINE",
    externalId: lineUserId,
    text,
    userId: link?.userId ?? null,
    displayName: existing?.displayName ?? (await lineProfileName(lineUserId)) ?? "LINE 用戶",
  });
  await respond(conversation.id, { lineReplyToken: ev.replyToken });
}

// 網站會員中心「綁定 LINE」：產生 6 位數綁定碼（10 分鐘有效）
export async function createLineLinkCode(userId: string) {
  await prisma.verification.deleteMany({ where: { identifier: { startsWith: LINK_PREFIX }, value: userId } });
  for (let i = 0; i < 5; i++) {
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
    const taken = await prisma.verification.findFirst({ where: { identifier: LINK_PREFIX + code, expiresAt: { gt: new Date() } } });
    if (taken) continue;
    await prisma.verification.create({
      data: { id: crypto.randomUUID(), identifier: LINK_PREFIX + code, value: userId, expiresAt: new Date(Date.now() + 10 * 60_000) },
    });
    return code;
  }
  throw new Error("無法產生綁定碼");
}

// ── Gmail ──
export async function pollGmail() {
  if (!gmailConfigured()) return { ok: false as const, error: "Gmail 尚未設定" };
  const emails = await fetchUnreadEmails();
  let handled = 0;
  for (const e of emails) {
    // 先標已讀：就算後面出錯，也不會一直重複處理同一封
    await markEmailRead(e.gmailId);
    if (e.automated || !e.text) continue;

    // 寄件者驗證通過、而且是會員的 Email，才算「已驗證身分」；沒通過還是能問一般問題，只是 AI 不會透露訂單資料。
    // （另外，回信一定寄回寄件地址，就算有人冒名，訂單資料也只會寄到真正的會員信箱）
    const member = e.senderVerified ? await prisma.user.findUnique({ where: { email: e.fromAddress }, select: { id: true } }) : null;
    const { conversation } = await ingestCustomerMessage({
      channel: "EMAIL",
      externalId: e.fromAddress,
      text: e.text,
      userId: member?.id ?? null,
      displayName: e.fromName ?? e.fromAddress,
      subject: e.subject,
      emailThreadId: e.threadId,
      channelMessageId: e.messageId,
    });
    await respond(conversation.id);
    handled++;
  }
  return { ok: true as const, fetched: emails.length, handled };
}

// 人工客服從後台回覆
export async function staffReply(conversationId: string, staffId: string, text: string) {
  return saveAndDeliver(conversationId, "STAFF", text, { staffId });
}
