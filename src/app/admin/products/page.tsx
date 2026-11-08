import type { Metadata } from "next";
import Link from "next/link";
import Form from "next/form";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { formatPrice } from "@/lib/store-config";

export const metadata: Metadata = { title: "商品管理" };

const STATUS_LABEL = { ACTIVE: "上架中", DRAFT: "草稿", ARCHIVED: "已下架" } as const;

export default async function AdminProducts({ searchParams }: PageProps<"/admin/products">) {
  await requireStaff(); // 每一頁都要自己檢查權限：layout 在換頁時不一定會重跑
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim() : "";
  const products = await prisma.product.findMany({
    where: query ? { OR: [{ name: { contains: query } }, { variants: { some: { sku: { contains: query } } } }] } : {},
    orderBy: { slug: "asc" },
    include: { category: { include: { parent: true } }, variants: { select: { stock: true } } },
  });

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">商品與庫存（{products.length}）</h1>
        <Form action="/admin/products" className="ml-auto flex gap-2">
          <input name="q" defaultValue={query} placeholder="商品名稱或 SKU" className="input w-56" />
          <button className="btn-outline">搜尋</button>
        </Form>
      </div>
      <div className="card mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-xs text-muted">
            <tr><th className="p-3">商品</th><th>分類</th><th>價格</th><th>SKU 數</th><th>總庫存</th><th>缺貨 SKU</th><th>狀態</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {products.map((p) => {
              const stock = p.variants.reduce((s, v) => s + v.stock, 0);
              const out = p.variants.filter((v) => v.stock === 0).length;
              return (
                <tr key={p.id} className="hover:bg-sand/50">
                  <td className="p-3"><Link href={`/admin/products/${p.id}`} className="text-brand underline">{p.name}</Link><br /><span className="font-mono text-xs text-muted">{p.slug}</span></td>
                  <td>{p.category.parent?.name}・{p.category.name}</td>
                  <td>{p.salePrice ? <><span className="text-accent">{formatPrice(p.salePrice)}</span> <s className="text-muted">{formatPrice(p.price)}</s></> : formatPrice(p.price)}</td>
                  <td>{p.variants.length}</td>
                  <td>{stock}</td>
                  <td className={out ? "text-bad" : "text-muted"}>{out}</td>
                  <td>{STATUS_LABEL[p.status]}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
