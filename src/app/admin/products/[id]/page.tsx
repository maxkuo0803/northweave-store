import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { ProductEditor } from "./ProductEditor";

export const metadata: Metadata = { title: "編輯商品" };

export default async function AdminProductEdit({ params }: PageProps<"/admin/products/[id]">) {
  await requireStaff(); // 每一頁都要自己檢查權限：layout 在換頁時不一定會重跑
  const { id } = await params;
  const product = await prisma.product.findUnique({ where: { id }, include: { variants: { orderBy: { sku: "asc" } }, images: { take: 1 } } });
  if (!product) notFound();

  return (
    <div>
      <Link href="/admin/products" className="text-sm text-muted">← 商品管理</Link>
      <div className="mt-2 flex items-center gap-3">
        <h1 className="text-xl font-bold">{product.name}</h1>
        {product.status === "ACTIVE" && <Link href={`/products/${product.slug}`} className="text-sm text-brand underline">查看前台頁面</Link>}
      </div>
      <ProductEditor
        product={{ id: product.id, name: product.name, price: product.price, salePrice: product.salePrice, status: product.status, description: product.description, isFeatured: product.isFeatured, image: product.images[0]?.url }}
        variants={product.variants.map((v) => ({ id: v.id, sku: v.sku, color: v.color, colorHex: v.colorHex, size: v.size, stock: v.stock }))}
      />
    </div>
  );
}
