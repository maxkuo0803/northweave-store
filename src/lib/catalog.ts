import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "./prisma";

// 商品列表卡片需要的欄位
export const productCardSelect = {
  id: true,
  name: true,
  slug: true,
  price: true,
  salePrice: true,
  images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true, alt: true } },
  variants: { select: { colorHex: true, color: true, stock: true } },
} satisfies Prisma.ProductSelect;

export type ProductCardData = Prisma.ProductGetPayload<{ select: typeof productCardSelect }>;

export const SORTS = {
  new: { label: "最新上架", orderBy: { createdAt: "desc" } },
  "price-asc": { label: "價格低到高", orderBy: { price: "asc" } },
  "price-desc": { label: "價格高到低", orderBy: { price: "desc" } },
} as const satisfies Record<string, { label: string; orderBy: Prisma.ProductOrderByWithRelationInput }>;
export type SortKey = keyof typeof SORTS;

export type ProductFilters = {
  category?: string;
  q?: string;
  size?: string;
  color?: string;
  sale?: boolean;
  sort?: SortKey;
  page?: number;
};

export const PAGE_SIZE = 12;

export async function listProducts(f: ProductFilters) {
  const where: Prisma.ProductWhereInput = { status: "ACTIVE" };
  if (f.category) {
    // 父分類（例如「男裝」）要包含所有子分類的商品
    where.category = { OR: [{ slug: f.category }, { parent: { slug: f.category } }] };
  }
  if (f.q) where.OR = [{ name: { contains: f.q } }, { description: { contains: f.q } }, { slug: { startsWith: f.q.trim().toLowerCase() } }];
  if (f.sale) where.salePrice = { not: null };
  if (f.size || f.color) {
    where.variants = { some: { ...(f.size && { size: f.size }), ...(f.color && { color: f.color }), stock: { gt: 0 } } };
  }
  const page = Math.max(1, f.page ?? 1);
  const [total, products] = await prisma.$transaction([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: SORTS[f.sort ?? "new"].orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: productCardSelect,
    }),
  ]);
  return { total, products, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export async function getFilterOptions() {
  const [sizes, colors] = await Promise.all([
    prisma.productVariant.findMany({ distinct: ["size"], select: { size: true }, where: { product: { status: "ACTIVE" } } }),
    prisma.productVariant.findMany({ distinct: ["color"], select: { color: true, colorHex: true }, where: { product: { status: "ACTIVE" } } }),
  ]);
  const order = ["XS", "S", "M", "L", "XL", "F"];
  const sortedSizes = sizes
    .map((s) => s.size)
    .sort((a, b) => {
      const ia = order.indexOf(a), ib = order.indexOf(b);
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      return Number(a) - Number(b);
    });
  return { sizes: sortedSizes, colors };
}

export async function getProductBySlug(slug: string) {
  return prisma.product.findFirst({
    where: { slug, status: "ACTIVE" },
    include: {
      category: { include: { parent: true } },
      images: { orderBy: { sortOrder: "asc" } },
      variants: { orderBy: { id: "asc" } },
      reviews: { orderBy: { createdAt: "desc" }, include: { user: { select: { name: true } } } },
    },
  });
}
