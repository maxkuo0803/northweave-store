import "server-only";
import { prisma } from "@/lib/prisma";
import type { Channel } from "@/generated/prisma/enums";
import { LIMITS } from "./config";
import { redactPII } from "./guard";

// 顧客傳來一則訊息（不管哪個平台）→ 找到或建立對話 → 遮罩個資後存起來。
// 之後呼叫 respond() 讓 AI 回覆。

export type IncomingMessage = {
  channel: Channel;
  externalId: string;
  text: string;
  userId: string | null; // 這則訊息「已驗證」的會員；沒驗證傳 null
  displayName?: string | null;
  subject?: string | null;
  emailThreadId?: string | null;
  channelMessageId?: string | null;
};

export async function ingestCustomerMessage(m: IncomingMessage) {
  const { text, found } = redactPII(m.text.trim().slice(0, LIMITS.maxInputChars));
  const existing = await prisma.conversation.findUnique({ where: { channel_externalId: { channel: m.channel, externalId: m.externalId } } });

  const conversation = existing
    ? await prisma.conversation.update({
        where: { id: existing.id },
        data: {
          lastMessageAt: new Date(),
          // 已結束的對話，顧客又傳訊息 → 重新開啟，交回 AI
          ...(existing.status === "CLOSED" && { status: "AI", handoffReason: null }),
          // 真人處理中 / 等待中 → 標記未讀提醒客服
          ...((existing.status === "HUMAN" || existing.status === "WAITING_HUMAN") && { staffUnread: true }),
          // 身分「每則訊息重新判斷」：例如 Email 這封沒通過寄件驗證、LINE 解除綁定，
          // 就立刻降回未驗證，不會因為之前驗證過就一直有權限
          userId: m.userId ?? null,
          ...(m.displayName && { displayName: m.displayName }),
          ...(m.emailThreadId && { emailThreadId: m.emailThreadId }),
        },
      })
    : await prisma.conversation.create({
        data: {
          channel: m.channel,
          externalId: m.externalId,
          userId: m.userId ?? null,
          displayName: m.displayName ?? null,
          subject: m.subject ?? null,
          emailThreadId: m.emailThreadId ?? null,
        },
      });

  const message = await prisma.message.create({
    data: { conversationId: conversation.id, role: "CUSTOMER", content: text, channelMessageId: m.channelMessageId ?? null },
  });
  return { conversation, message, redacted: found };
}
