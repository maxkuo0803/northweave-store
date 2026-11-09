import { NextResponse } from "next/server";
import { z } from "zod";
import { recordView } from "@/lib/recommend";
import { sameOrigin, webIdentity } from "@/lib/agent/web";
import { rateLimit } from "@/lib/rate-limit";

// 記錄「看了哪件商品」，推薦用。只記商品 ID 和隨機訪客 ID。
export async function POST(req: Request) {
  if (!sameOrigin(req)) return new NextResponse(null, { status: 403 });
  const parsed = z.object({ productId: z.string().max(40) }).safeParse(await req.json().catch(() => null));
  const who = await webIdentity();
  if (!parsed.success || !who.visitorId) return new NextResponse(null, { status: 204 });
  if (await rateLimit(`track:${who.visitorId}`, 60, 3600)) await recordView({ visitorId: who.visitorId, userId: who.userId }, parsed.data.productId);
  return new NextResponse(null, { status: 204 });
}
