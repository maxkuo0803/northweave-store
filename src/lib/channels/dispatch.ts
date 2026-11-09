import "server-only";
import { prisma } from "@/lib/prisma";
import type { MessageRole } from "@/generated/prisma/enums";
import { lineConfigured, linePush, lineReply } from "./line";
import { gmailConfigured, sendEmail } from "./gmail";

// 送出回覆：AI 和人工客服都走這裡。
// 自動看這段對話是哪個平台來的（conversation.channel），就用那個平台回。

export type DeliverOptions = { lineReplyToken?: string | null };

export async function saveAndDeliver(
  conversationId: string,
  role: Extract<MessageRole, "AI" | "STAFF" | "SYSTEM">,
  text: string,
  opts: DeliverOptions & { staffId?: string } = {},
) {
  const conv = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });
  const msg = await prisma.message.create({ data: { conversationId, role, content: text, staffId: opts.staffId ?? null } });
  await prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } });

  let delivery = "SENT";
  let deliveryError: string | null = null;
  let channelMessageId: string | null = null;
  try {
    switch (conv.channel) {
      case "WEB":
        // 網站聊天視窗會自己來拿新訊息（輪詢），存進資料庫就算送達
        break;
      case "LINE": {
        if (!lineConfigured()) throw new Error("LINE 尚未設定（LINE_CHANNEL_SECRET / LINE_CHANNEL_ACCESS_TOKEN）");
        // reply token 只能用一次、約 1 分鐘內有效；用不了就改用 push
        if (opts.lineReplyToken) {
          try {
            await lineReply(opts.lineReplyToken, text);
            break;
          } catch {
            /* token 過期 → 改用 push */
          }
        }
        await linePush(conv.externalId, text);
        break;
      }
      case "EMAIL": {
        if (!gmailConfigured()) throw new Error("Gmail 尚未設定（GMAIL_CLIENT_ID 等環境變數）");
        // 接在顧客最後一封信後面，對方信箱才會顯示成同一串
        const lastIn = await prisma.message.findFirst({
          where: { conversationId, role: "CUSTOMER", channelMessageId: { not: null } },
          orderBy: { createdAt: "desc" },
        });
        const prefix = role === "AI" ? "（本信由 AI 客服小織回覆，需要真人協助請直接回信說「真人」）\n\n" : "";
        channelMessageId = await sendEmail({
          to: conv.externalId,
          subject: conv.subject ?? "北織客服回覆",
          text: `${prefix}${text}\n\n—\n北織 NORTHWEAVE 客服`,
          threadId: conv.emailThreadId,
          inReplyTo: lastIn?.channelMessageId,
          automated: role !== "STAFF",
        });
        break;
      }
    }
  } catch (e) {
    delivery = "FAILED";
    deliveryError = e instanceof Error ? e.message : String(e);
    console.error(`[deliver] ${conv.channel} failed`, deliveryError);
  }
  return prisma.message.update({ where: { id: msg.id }, data: { delivery, deliveryError, channelMessageId } });
}
