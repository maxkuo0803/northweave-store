import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getFilterOptions, listProducts, SORTS, type SortKey } from "@/lib/catalog";
import { ProductCard, Rail } from "@/components/ProductCard";
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


  const chip = (on: boolean) =>
    cn("rounded-sm px-2.5 py-1 font-bold transition-colors", on ? "bg-ink text-white" : "bg-sand hover:bg-line");

  return (
    <div className="pegboard min-h-[70vh] pt-10 pb-16">
      <div className="mx-auto max-w-6xl px-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="kraft-tag -rotate-1 px-5 py-2.5">
            <h1 className="text-2xl font-black md:text-3xl">{title}</h1>
            <p className="font-marker text-sm">{total} 件</p>
          </div>
          <nav aria-label="排序" className="card flex gap-1 p-1 text-sm">
            {(Object.keys(SORTS) as SortKey[]).map((k) => (
              <Link key={k} href={hrefWith(sp, { sort: k })} aria-current={filters.sort === k ? "true" : undefined} className={chip(filters.sort === k)}>
                {SORTS[k].label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="mt-8 grid gap-8 md:grid-cols-[210px_1fr]">
          {/* 篩選：手機版收合，桌機版是一張貼在洞洞板上的告示 */}
          <details className="md:hidden">
            <summary className="btn-outline w-fit list-none">篩選與分類</summary>
            <div className="card mt-3 p-4">{filtersUi()}</div>
          </details>
          <aside className="card hidden h-fit rotate-[-0.4deg] p-5 md:block">{filtersUi()}</aside>

          <div>
            {products.length === 0 ? (
              <div className="card mx-auto max-w-sm p-8 text-center">
                <p className="text-lg font-black">這排是空的</p>
                <p className="mt-2 text-sm text-muted">沒有符合條件、而且有庫存的商品。換個尺寸或顏色試試。</p>
                <Link href="/products" className="btn-outline mt-5">清除全部篩選</Link>
              </div>
            ) : (
              <Rail cols="lg:grid-cols-3">
                {products.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}
              </Rail>
            )}
            {pages > 1 && (
              <nav aria-label="分頁" className="mt-14 flex justify-center gap-2 text-sm">
                {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
                  <Link
                    key={n}
                    href={hrefWith(sp, { page: String(n) })}
                    aria-current={n === page ? "page" : undefined}
                    className={cn("grid h-10 w-10 place-items-center font-marker text-base", n === page ? "kraft-tag" : "card hover:bg-white")}
                  >
                    {n}
                  </Link>
                ))}
              </nav>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  function filtersUi() {
    const hasFilter = filters.size || filters.color || filters.sale || filters.q;
    return (
      <div className="space-y-6 text-sm">
        <div>
          <p className="mb-2 font-black">分類</p>
          <ul className="space-y-1">
            <li><Link href={hrefWith(sp, { category: undefined })} className={cn("hover:underline", !category && "font-black underline decoration-2")}>全部</Link></li>
            {categories.map((c) => (
              <li key={c.id}>
                <Link href={hrefWith(sp, { category: c.slug })} className={cn("hover:underline", category === c.slug && "font-black underline decoration-2")}>{c.name}</Link>
                <ul className="mt-1 ml-3 space-y-1 text-muted">
                  {c.children.map((ch) => (
                    <li key={ch.id}><Link href={hrefWith(sp, { category: ch.slug })} className={cn("hover:text-ink hover:underline", category === ch.slug && "font-black text-ink underline decoration-2")}>{ch.name}</Link></li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-2 font-black">尺寸<span className="ml-1 font-normal text-muted">（有庫存）</span></p>
          <div className="flex flex-wrap gap-1.5">
            {options.sizes.map((s) => (
              <Link key={s} href={hrefWith(sp, { size: filters.size === s ? undefined : s })} aria-pressed={filters.size === s} className={cn("min-w-9 text-center", chip(filters.size === s))}>{s}</Link>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 font-black">顏色</p>
          <div className="flex flex-wrap gap-2">
            {options.colors.map((c) => (
              <Link
                key={c.color}
                title={c.color}
                aria-label={c.color}
                aria-pressed={filters.color === c.color}
                href={hrefWith(sp, { color: filters.color === c.color ? undefined : c.color })}
                className={cn("h-7 w-7 rounded-sm ring-1 ring-ink/25", filters.color === c.color && "ring-2 ring-ink ring-offset-2")}
                style={{ background: c.colorHex }}
              />
            ))}
          </div>
        </div>
        <Link href={hrefWith(sp, { sale: filters.sale ? undefined : "1" })} aria-pressed={filters.sale} className={cn("inline-block rounded-sm px-3 py-1.5 font-black", filters.sale ? "neon-card" : "bg-sand hover:bg-line")}>
          {filters.sale ? "正在看特價・取消" : "只看特價"}
        </Link>
        {hasFilter && (
          <p><Link href={category ? `/products?category=${category}` : "/products"} className="text-muted underline">清除篩選</Link></p>
        )}
      </div>
    );
  }
}
