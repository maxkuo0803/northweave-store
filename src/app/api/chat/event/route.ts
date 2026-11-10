import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { sameOrigin, webIdentity } from "@/lib/agent/web";

// 聊天視窗送來的使用統計事件（打開小織、點了哪個入口、招呼有沒有被點…）
const TYPES = ["visit", "greet_shown", "greet_click", "open", "chip_click", "nudge_shown", "hint_shown", "hint_click"] as const;

export async function POST(req: Request) {
  if (!sameOrigin(req)) return new NextResponse(null, { status: 403 });
  const parsed = z
    .object({ type: z.enum(TYPES), source: z.string().max(40).optional(), path: z.string().max(200).optional() })
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new NextResponse(null, { status: 204 });
  const who = await webIdentity();
  // 一個訪客一小時最多記 200 筆，避免有人灌爆統計
  if (!(await rateLimit(`chat-event:${who.visitorId ?? who.userId ?? "anon"}`, 200, 3600))) return new NextResponse(null, { status: 204 });
  await prisma.chatEvent.create({
    data: { visitorId: who.visitorId, userId: who.userId, type: parsed.data.type, source: parsed.data.source ?? null, path: parsed.data.path ?? null },
  });
  return new NextResponse(null, { status: 204 });
}
