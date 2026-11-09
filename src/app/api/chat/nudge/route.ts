import { NextResponse } from "next/server";
import { proactiveNudge } from "@/lib/recommend";
import { webIdentity } from "@/lib/agent/web";
import { garmentImageUrl } from "@/lib/store-config";

// 主動推薦：聊天視窗沒打開時，依顧客正在看的頁面決定要不要跳出推薦泡泡。
// 全部用規則計算，不呼叫 AI，所以不花錢。
export async function GET(req: Request) {
  const url = new URL(req.url);
  const path = (url.searchParams.get("path") ?? "/").slice(0, 200);
  const productSlug = path.match(/^\/products\/([^/?]+)/)?.[1] ?? null;
  const who = await webIdentity();
  const nudge = await proactiveNudge({ visitorId: who.visitorId, userId: who.userId }, { path, productSlug });
  if (!nudge) return NextResponse.json({ nudge: null });
  return NextResponse.json({
    nudge: {
      message: nudge.message,
      products: nudge.products.map((p) => ({
        slug: p.slug,
        code: p.slug.split("-")[0].toUpperCase(),
        name: p.name,
        price: p.salePrice ?? p.price,
        onSale: !!p.salePrice,
        image: p.images[0]?.url ?? garmentImageUrl("tee", p.variants[0]?.colorHex ?? "#888888"),
      })),
    },
  });
}
