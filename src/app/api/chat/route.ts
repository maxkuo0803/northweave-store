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

type PublicMessage = { id: string; role: string; content: string; attachments: unknown; createdAt: Date };
const publicFields = { id: true, role: true, content: true, attachments: true, createdAt: true } as const;

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

  const finish = async () => {
    const messages: PublicMessage[] = await prisma.message.findMany({
      where: { conversationId: conversation.id, createdAt: { gte: message.createdAt } },
      orderBy: { createdAt: "asc" },
      select: publicFields,
    });
    const status = (await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id }, select: { status: true } })).status;
    return { status, messages };
  };

  // 聊天視窗要求串流：每做一步就送一行 JSON（例如 {"type":"progress","label":"找商品中"}），最後送完整回覆
  if (req.headers.get("accept")?.includes("application/x-ndjson")) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: object) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        try {
          await respond(conversation.id, { visitorId: who.visitorId, currentPath: parsed.data.path, onProgress: (label) => send({ type: "progress", label }) });
          send({ type: "done", ...(await finish()) });
        } catch (e) {
          console.error("[chat] respond failed", e);
          send({ type: "error", error: "系統忙碌中，請稍後再試" });
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
  }

  // 一般 JSON（其他程式呼叫用）
  await respond(conversation.id, { visitorId: who.visitorId, currentPath: parsed.data.path });
  return NextResponse.json(await finish());
}
