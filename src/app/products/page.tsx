import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getFilterOptions, listProducts, SORTS, type SortKey } from "@/lib/catalog";
import { ProductCard } from "@/components/ProductCard";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "全部商品" };

type Search = Record<string, string | string[] | undefined>;
const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);

// 保留目前的篩選條件，只改其中一個參數
function hrefWith(sp: Search, patch: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...sp, page: undefined, ...patch })) {
    if (typeof v === "string" && v) params.set(k, v);
  }
  const qs = params.toString();
  return qs ? `/products?${qs}` : "/products";
}

export default async function ProductsPage({ searchParams }: PageProps<"/products">) {
  const sp = await searchParams;
  const category = str(sp.category);
  const sort = (str(sp.sort) ?? "new") as SortKey;
  const filters = {
    category,
    q: str(sp.q),
    size: str(sp.size),
    color: str(sp.color),
    sale: sp.sale === "1",
    sort: sort in SORTS ? sort : "new",
    page: Number(str(sp.page) ?? 1) || 1,
  };

  const [{ products, total, page, pages }, options, categories] = await Promise.all([
    listProducts(filters),
    getFilterOptions(),
    prisma.category.findMany({ where: { parentId: null }, orderBy: { sortOrder: "asc" }, include: { children: { orderBy: { sortOrder: "asc" } } } }),
  ]);
  const current = categories.flatMap((c) => [c, ...c.children.map((ch) => ({ ...ch, parentName: c.name }))]).find((c) => c.slug === category);
  const title = filters.q ? `搜尋「${filters.q}」` : filters.sale ? "特價商品" : current ? ("parentName" in current ? `${current.parentName}・${current.name}` : current.name) : "全部商品";

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-1 text-sm text-muted">共 {total} 件商品</p>

      <div className="mt-6 grid gap-8 md:grid-cols-[200px_1fr]">
        {/* 篩選：手機版收合成「篩選」按鈕，桌機版固定在左側 */}
        <details className="group md:hidden">
          <summary className="btn-outline w-fit list-none">篩選與分類</summary>
          <div className="mt-4">{filters_ui()}</div>
        </details>
        <aside className="hidden md:block">{filters_ui()}</aside>

        {products_ui()}
      </div>
    </div>
  );

  function filters_ui() {
    return (
        <div className="space-y-6 text-sm">
          <div>
            <p className="mb-2 font-medium">分類</p>
            <ul className="space-y-1">
              <li><Link href={hrefWith(sp, { category: undefined })} className={cn(!category && "font-bold text-brand")}>全部</Link></li>
              {categories.map((c) => (
                <li key={c.id}>
                  <Link href={hrefWith(sp, { category: c.slug })} className={cn(category === c.slug && "font-bold text-brand")}>{c.name}</Link>
                  <ul className="mt-1 ml-3 space-y-1 text-muted">
                    {c.children.map((ch) => (
                      <li key={ch.id}><Link href={hrefWith(sp, { category: ch.slug })} className={cn("hover:text-ink", category === ch.slug && "font-bold text-brand")}>{ch.name}</Link></li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-2 font-medium">尺寸（有庫存）</p>
            <div className="flex flex-wrap gap-1.5">
              {options.sizes.map((s) => (
                <Link key={s} href={hrefWith(sp, { size: filters.size === s ? undefined : s })} className={cn("rounded-md border px-2 py-1", filters.size === s ? "border-brand bg-brand text-white" : "border-line bg-card")}>{s}</Link>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 font-medium">顏色</p>
            <div className="flex flex-wrap gap-2">
              {options.colors.map((c) => (
                <Link key={c.color} title={c.color} aria-label={c.color} href={hrefWith(sp, { color: filters.color === c.color ? undefined : c.color })}
                  className={cn("h-6 w-6 rounded-full border", filters.color === c.color ? "ring-2 ring-brand ring-offset-2" : "border-ink/15")} style={{ background: c.colorHex }} />
              ))}
            </div>
          </div>
          <Link href={hrefWith(sp, { sale: filters.sale ? undefined : "1" })} className={cn("inline-block rounded-full border px-3 py-1", filters.sale ? "border-accent bg-accent text-white" : "border-line bg-card")}>只看特價</Link>
          {(filters.size || filters.color || filters.sale || filters.q) && (
            <p><Link href={category ? `/products?category=${category}` : "/products"} className="text-muted underline">清除篩選</Link></p>
          )}
        </div>
    );
  }

  function products_ui() {
    return (
        <div>
          <div className="mb-4 flex justify-end gap-3 text-sm">
            {(Object.keys(SORTS) as SortKey[]).map((k) => (
              <Link key={k} href={hrefWith(sp, { sort: k })} className={cn(filters.sort === k ? "font-bold text-brand" : "text-muted")}>{SORTS[k].label}</Link>
            ))}
          </div>
          {products.length === 0 ? (
            <p className="py-20 text-center text-muted">找不到符合條件的商品</p>
          ) : (
            <div className="grid grid-cols-2 gap-x-4 gap-y-8 lg:grid-cols-3">
              {products.map((p) => <ProductCard key={p.id} product={p} />)}
            </div>
          )}
          {pages > 1 && (
            <nav className="mt-10 flex justify-center gap-2 text-sm">
              {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
                <Link key={n} href={hrefWith(sp, { page: String(n) })} className={cn("grid h-9 w-9 place-items-center rounded-full border", n === page ? "border-brand bg-brand text-white" : "border-line bg-card")}>{n}</Link>
              ))}
            </nav>
          )}
        </div>
    );
  }
}
