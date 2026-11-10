import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { addToCart } from "@/lib/shop";
import { rateLimit, TOO_MANY } from "@/lib/rate-limit";
import { ingestCustomerMessage } from "@/lib/agent/conversations";
import { sameOrigin } from "@/lib/agent/web";

// 聊天視窗的「顏色 / 尺寸選擇器」按下加入購物車：
// 直接加入（不經過 AI，馬上完成、不花 AI 費用），再在對話裡留一筆紀錄，小織接下來就知道顧客加了什麼。
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "請先登入會員", login: true }, { status: 401 });
  const parsed = z.object({ variantId: z.string().max(40), quantity: z.number().int().min(1).max(10).default(1) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "資料格式錯誤" }, { status: 400 });
  if (!(await rateLimit(`chat-cart:${session.user.id}`, 30, 60))) return NextResponse.json({ error: TOO_MANY }, { status: 429 });

  // 規則（庫存、上下架、數量上限）跟網站的加入購物車按鈕完全一樣
  const r = await addToCart(session.user.id, parsed.data.variantId, parsed.data.quantity);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });

  // 在對話裡記一筆「顧客用按鈕加入了什麼」（只記錄，不觸發 AI 回覆）
  const v = await prisma.productVariant.findUnique({ where: { id: parsed.data.variantId }, select: { color: true, size: true, product: { select: { slug: true, name: true } } } });
  const { message } = await ingestCustomerMessage({
    channel: "WEB",
    externalId: `user:${session.user.id}`,
    userId: session.user.id,
    displayName: session.user.name,
    text: `（已用按鈕加入購物車）${v?.product.slug.split("-")[0].toUpperCase()} ${v?.product.name} ${v?.color} / ${v?.size} × ${parsed.data.quantity}`,
  });
  const cart = await prisma.cartItem.aggregate({ where: { userId: session.user.id }, _sum: { quantity: true } });
  revalidatePath("/", "layout");
  return NextResponse.json({
    ok: true,
    message: r.message,
    cartCount: cart._sum.quantity ?? 0,
    note: { id: message.id, role: message.role, content: message.content, createdAt: message.createdAt },
  });
}
