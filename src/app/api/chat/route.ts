import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { ingestCustomerMessage } from "@/lib/agent/conversations";
import { respond } from "@/lib/agent/run";
import { LIMITS } from "@/lib/agent/config";
import { sameOrigin, webIdentity } from "@/lib/agent/web";

// 網站聊天視窗的 API
// GET  /api/chat?after=時間  → 拿新訊息（視窗每幾秒問一次，人工客服的回覆也是這樣收到的）
// POST /api/chat            → 顧客送出訊息，等 AI 回覆後一起回傳

export const maxDuration = 30; // AI 最多想 30 秒

type PublicMessage = { id: string; role: string; content: string; createdAt: Date };
const publicFields = { id: true, role: true, content: true, createdAt: true } as const;

async function myConversation() {
  const who = await webIdentity();
  if (!who.externalId) return { who, conv: null };
  const conv = await prisma.conversation.findUnique({ where: { channel_externalId: { channel: "WEB", externalId: who.externalId } } });
  return { who, conv };
}

export async function GET(req: Request) {
  const { conv } = await myConversation();
  if (!conv) return NextResponse.json({ status: "AI", messages: [] });
  const afterParam = new URL(req.url).searchParams.get("after");
  const after = afterParam ? new Date(afterParam) : null;
  const messages: PublicMessage[] = await prisma.message.findMany({
    where: { conversationId: conv.id, ...(after && !isNaN(+after) && { createdAt: { gt: after } }) },
    orderBy: { createdAt: "asc" },
    take: 50,
    select: publicFields,
  });
  return NextResponse.json({ status: conv.status, messages });
}

const bodySchema = z.object({ text: z.string().trim().min(1).max(LIMITS.maxInputChars), path: z.string().max(200).optional() });

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: `訊息請在 ${LIMITS.maxInputChars} 字以內` }, { status: 400 });

  const who = await webIdentity();
  if (!who.externalId) return NextResponse.json({ error: "請重新整理頁面後再試" }, { status: 400 });
  // 同一個 IP 每分鐘最多 20 則（擋機器人換 cookie 狂刷）
  if (!(await rateLimit(`chat:ip:${await clientIp()}`, 20, 60))) return NextResponse.json({ error: "訊息太頻繁，請稍後再試" }, { status: 429 });

  const { conversation, message } = await ingestCustomerMessage({
    channel: "WEB",
    externalId: who.externalId,
    text: parsed.data.text,
    userId: who.userId,
    displayName: who.displayName ?? "網站訪客",
  });
  await respond(conversation.id, { visitorId: who.visitorId, currentPath: parsed.data.path });

  const messages: PublicMessage[] = await prisma.message.findMany({
    where: { conversationId: conversation.id, createdAt: { gte: message.createdAt } },
    orderBy: { createdAt: "asc" },
    select: publicFields,
  });
  const status = (await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id }, select: { status: true } })).status;
  return NextResponse.json({ status, messages });
}
