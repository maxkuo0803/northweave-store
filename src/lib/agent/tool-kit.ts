import "server-only";
import type { z } from "zod";
import type { Channel } from "@/generated/prisma/enums";

// AI 工具共用的型別與小工具

// 這次回覆「附帶」給顧客的東西（只有網站聊天視窗會顯示成卡片 / 按鈕）
export type ProductCard = { code: string; name: string; price: number; originalPrice?: number; onSale?: boolean; url: string; image: string };
export type ReplyEffects = {
  products: Map<string, ProductCard>; // 工具查到的商品（key = 商品編號），回覆提到哪幾件就附上哪幾件的卡片
  links: { label: string; href: string }[]; // 按鈕，例如「前往結帳」
  refresh: boolean; // 購物車、訂單有變動 → 網頁要重新整理（例如右上角購物車數量）
};
export const newEffects = (): ReplyEffects => ({ products: new Map(), links: [], refresh: false });

export type AgentContext = {
  conversationId: string;
  channel: Channel;
  userId: string | null; // 已驗證身分的會員；null = 不知道是誰
  visitorId: string | null;
  currentPath?: string | null;
  effects: ReplyEffects;
};

export type ToolDef = {
  description: string;
  schema: z.ZodObject;
  needsUser?: boolean; // 需要先驗證會員身分
  run: (input: never, ctx: AgentContext) => Promise<unknown>;
};

export const SITE = () => process.env.BETTER_AUTH_URL || "http://localhost:3000";
export const siteUrl = (path: string) => `${SITE()}${path}`;

// 商品摘要：給 AI 看，也會變成聊天視窗裡的商品卡片
export function productBrief(p: { slug: string; name: string; price: number; salePrice: number | null; images?: { url: string }[] }): ProductCard {
  return {
    code: p.slug.split("-")[0].toUpperCase(),
    name: p.name,
    price: p.salePrice ?? p.price,
    ...(p.salePrice && { originalPrice: p.price, onSale: true }),
    url: siteUrl(`/products/${p.slug}`),
    image: p.images?.[0]?.url ?? "",
  };
}

export const productImageSelect = { orderBy: { sortOrder: "asc" as const }, take: 1, select: { url: true } };
