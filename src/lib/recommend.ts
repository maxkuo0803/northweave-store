import "server-only";
import { prisma } from "./prisma";
import { productCardSelect } from "./catalog";
import { SHIPPING } from "./store-config";
import type { Prisma } from "@/generated/prisma/client";

// 商品推薦：用規則算，不呼叫 AI（免費、快、結果可預期）。
// 依據：瀏覽紀錄（看過什麼）、搭配邏輯（上衣配褲子）、特價、庫存。

const GROUP: Record<string, "top" | "bottom" | "outer" | "dress" | "acc"> = {
  tee: "top", longtee: "top", polo: "top", shirt: "top", blouse: "top", tank: "top", hoodie: "top", sweat: "top", knit: "top", cardigan: "outer",
  jacket: "outer", vest: "outer",
  pants: "bottom", shorts: "bottom", skirt: "bottom",
  dress: "dress",
  cap: "acc", bag: "acc",
};
// 看了 A 類，推薦能搭配的 B 類
const PAIRS: Record<string, string[]> = {
  top: ["bottom", "outer", "acc"],
  bottom: ["top", "outer"],
  outer: ["top", "bottom"],
  dress: ["outer", "acc"],
  acc: ["top", "dress"],
};

export type Who = { visitorId?: string | null; userId?: string | null };

export async function recordView(who: Who, productId: string) {
  if (!who.visitorId && !who.userId) return;
  // 同一個人 10 分鐘內重複看同一件不重複記
  const recent = await prisma.browseEvent.findFirst({
    where: { productId, createdAt: { gt: new Date(Date.now() - 10 * 60_000) }, OR: whoWhere(who) },
  });
  if (!recent) await prisma.browseEvent.create({ data: { visitorId: who.visitorId ?? "member", userId: who.userId ?? null, productId } });
}

function whoWhere(who: Who): Prisma.BrowseEventWhereInput[] {
  return [...(who.userId ? [{ userId: who.userId }] : []), ...(who.visitorId ? [{ visitorId: who.visitorId }] : [])];
}

export async function recentlyViewed(who: Who, take = 6) {
  const or = whoWhere(who);
  if (!or.length) return [];
  const events = await prisma.browseEvent.findMany({ where: { OR: or }, orderBy: { createdAt: "desc" }, take: 30, select: { productId: true } });
  return [...new Set(events.map((e) => e.productId))].slice(0, take);
}

const inStock = { status: "ACTIVE", variants: { some: { stock: { gt: 0 } } } } satisfies Prisma.ProductWhereInput;

// 推薦清單：根據「正在看的商品」或「最近看過的商品」找可以搭配的、同性別、有庫存的商品
export async function recommendFor(who: Who, opts: { currentProductId?: string; take?: number } = {}) {
  const take = opts.take ?? 4;
  const viewed = await recentlyViewed(who, 8);
  const seedIds = opts.currentProductId ? [opts.currentProductId, ...viewed] : viewed;
  const seeds = seedIds.length
    ? await prisma.product.findMany({ where: { id: { in: seedIds } }, select: { id: true, garmentType: true, gender: true } })
    : [];

  const exclude = [...new Set([...(opts.currentProductId ? [opts.currentProductId] : []), ...viewed.slice(0, 3)])];
  if (seeds.length === 0) {
    // 新訪客：推精選 + 特價
    const products = await prisma.product.findMany({
      where: { ...inStock, OR: [{ isFeatured: true }, { salePrice: { not: null } }], id: { notIn: exclude } },
      orderBy: { createdAt: "desc" }, take, select: productCardSelect,
    });
    return { reason: "店長精選", products };
  }

  const main = seeds.find((s) => s.id === opts.currentProductId) ?? seeds[0];
  const wantGroups = PAIRS[GROUP[main.garmentType] ?? "top"];
  const wantTypes = Object.entries(GROUP).filter(([, g]) => wantGroups.includes(g)).map(([t]) => t);
  const genders = main.gender === "UNISEX" ? undefined : [main.gender, "UNISEX" as const];

  const candidates = await prisma.product.findMany({
    where: { ...inStock, garmentType: { in: wantTypes }, id: { notIn: exclude }, ...(genders && { gender: { in: genders } }) },
    select: { ...productCardSelect, isFeatured: true, garmentType: true },
    take: 40,
  });
  // 排序：特價 > 精選 > 其他；同分時用 id 固定順序（每次結果一樣）
  const score = (p: (typeof candidates)[number]) => (p.salePrice ? 2 : 0) + (p.isFeatured ? 1 : 0);
  const picked: typeof candidates = [];
  const usedTypes = new Set<string>();
  // 盡量每種類型挑一件，推薦才不會四件都是褲子
  for (const p of [...candidates].sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id))) {
    if (picked.length >= take) break;
    if (usedTypes.has(p.garmentType) && candidates.length > take * 2) continue;
    usedTypes.add(p.garmentType);
    picked.push(p);
  }
  return { reason: "跟你看過的商品很搭", products: picked };
}

// 主動跳出的推薦訊息（不花 AI 費用）：根據顧客在哪一頁、購物車狀態決定要說什麼
export async function proactiveNudge(who: Who, ctx: { path: string; productSlug?: string | null }) {
  // 1) 購物車快到免運門檻
  if (who.userId && (ctx.path === "/cart" || ctx.path.startsWith("/products"))) {
    const cart = await prisma.cartItem.findMany({ where: { userId: who.userId }, include: { variant: { include: { product: { select: { price: true, salePrice: true } } } } } });
    const subtotal = cart.reduce((s, c) => s + (c.variant.product.salePrice ?? c.variant.product.price) * c.quantity, 0);
    const gap = SHIPPING.freeThreshold - subtotal;
    if (subtotal > 0 && gap > 0 && gap <= 800) {
      const products = await prisma.product.findMany({
        where: { ...inStock, OR: [{ salePrice: { gte: gap, lte: gap + 500 } }, { salePrice: null, price: { gte: gap, lte: gap + 500 } }] },
        orderBy: { price: "asc" }, take: 3, select: productCardSelect,
      });
      if (products.length) return { message: `再買 NT$${gap.toLocaleString()} 就免運，這幾件剛好補上差額：`, products };
    }
  }

  // 2) 正在看某件商品：推薦搭配
  if (ctx.productSlug) {
    const p = await prisma.product.findUnique({ where: { slug: ctx.productSlug }, select: { id: true, name: true, variants: { select: { size: true, stock: true } } } });
    if (p) {
      const low = p.variants.filter((v) => v.stock > 0 && v.stock <= 3).map((v) => v.size);
      const rec = await recommendFor(who, { currentProductId: p.id, take: 3 });
      if (rec.products.length) {
        const lowNote = low.length ? `（${[...new Set(low)].join("、")} 號剩不多）` : "";
        return { message: `在看「${p.name}」嗎？${lowNote}這幾件跟它很好搭：`, products: rec.products };
      }
    }
  }

  // 3) 逛了好幾件還沒下手：推薦相似的特價品
  const viewed = await recentlyViewed(who, 5);
  if (viewed.length >= 3) {
    const rec = await recommendFor(who, { take: 3 });
    if (rec.products.length) return { message: "看了好幾件了，要不要參考這些？有問題也可以直接問我：", products: rec.products };
  }
  return null;
}
