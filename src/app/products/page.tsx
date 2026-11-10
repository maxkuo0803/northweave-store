import type { Metadata } from "next";
import Link from "next/link";
import { AskButton } from "@/components/chat/AskChips";
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
    cn("rounded-full border px-3 py-1.5 font-bold transition-colors", on ? "border-ink bg-ink text-white" : "border-ink/15 bg-white/60 hover:border-ink/50");

  return (
    <div className="container-x pt-10 pb-8 md:pt-14">
      {/* 標題列 */}
      <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-6 border-b border-line pb-8">
        <div>
          <h1 className="display text-[clamp(36px,5vw,64px)] leading-[1.05]">{title}</h1>
          <p className="mt-3 text-sm text-muted">
            <span className="font-mono font-semibold text-ink tabular-nums">{total}</span> 件商品{filters.size && `・尺寸 ${filters.size}`}{filters.color && `・${filters.color}`}
          </p>
          {/* 搜尋結果太少：店員小織用「意思」幫忙找（例如「約會」「下雨天」這種商品名稱裡沒有的字） */}
          {filters.q && total < 3 && (
            <AskButton className="mt-4" source="search-few" label={`讓小織幫你找「${filters.q}」`} text={`幫我找：${filters.q}`} />
          )}
        </div>
        <div className="flex w-full flex-wrap items-center gap-3 md:w-auto">
          <form action="/products" className="relative w-full md:w-60">
            {category && <input type="hidden" name="category" value={category} />}
            <svg aria-hidden viewBox="0 0 20 20" className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted">
              <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <path d="M13 13 L17 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <input name="q" defaultValue={filters.q} placeholder="搜尋商品或編號" aria-label="搜尋商品" className="input h-10 rounded-full pl-10" />
          </form>
          <nav aria-label="排序" className="flex gap-1 rounded-full bg-sand p-1 text-sm">
            {(Object.keys(SORTS) as SortKey[]).map((k) => (
              <Link
                key={k}
                href={hrefWith(sp, { sort: k })}
                aria-current={filters.sort === k ? "true" : undefined}
                className={cn("rounded-full px-3.5 py-1.5 font-bold transition-colors", filters.sort === k ? "bg-card shadow-sm" : "text-ink/65 hover:text-ink")}
              >
                {SORTS[k].label}
              </Link>
            ))}
          </nav>
        </div>
      </div>

      <div className="mt-10 grid gap-10 md:grid-cols-[200px_1fr] lg:gap-14">
        {/* 篩選：手機版收合，桌機版固定在左邊 */}
        <details className="md:hidden">
          <summary className="btn-outline w-fit list-none">篩選與分類</summary>
          <div className="mt-4 rounded-card border border-line bg-card p-5">{filtersUi()}</div>
        </details>
        <aside aria-label="篩選" className="sticky top-32 hidden h-fit md:block">{filtersUi()}</aside>

        <div>
          {products.length === 0 ? (
            <div className="rounded-card border border-dashed border-ink/25 px-6 py-16 text-center">
              <p className="display text-2xl">這排是空的</p>
              <p className="mt-2 text-sm text-muted">沒有符合條件、而且有庫存的商品。換個尺寸或顏色試試，或直接告訴小織你想找什麼。</p>
              <AskButton className="mt-5" source="search-empty" label="跟小織說你想找什麼" text={filters.q ? `幫我找：${filters.q}` : "我在找衣服，可以幫我推薦嗎？"} />
              <Link href="/products" className="btn-outline mt-6">清除全部篩選</Link>
            </div>
          ) : (
            <Rail cols="lg:grid-cols-3">
              {products.map((p) => <ProductCard key={p.id} product={p} />)}
            </Rail>
          )}
          {pages > 1 && (
            <nav aria-label="分頁" className="mt-16 flex justify-center gap-2 text-sm">
              {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
                <Link
                  key={n}
                  href={hrefWith(sp, { page: String(n) })}
                  aria-current={n === page ? "page" : undefined}
                  className={cn(
                    "grid h-11 w-11 place-items-center rounded-full font-mono font-semibold transition-colors",
                    n === page ? "bg-ink text-white" : "border border-ink/15 hover:border-ink",
                  )}
                >
                  {n}
                </Link>
              ))}
            </nav>
          )}
        </div>
      </div>
    </div>
  );

  function filtersUi() {
    const hasFilter = filters.size || filters.color || filters.sale || filters.q;
    return (
      <div className="space-y-8 text-sm">
        <div>
          <p className="mb-3 text-xs font-bold tracking-[0.2em] text-muted">分類</p>
          <ul className="space-y-1.5">
            <li><Link href={hrefWith(sp, { category: undefined })} className={cn("hover:underline", !category && "font-black")}>全部</Link></li>
            {categories.map((c) => (
              <li key={c.id}>
                <Link href={hrefWith(sp, { category: c.slug })} className={cn("font-bold hover:underline", category === c.slug && "font-black underline decoration-2")}>{c.name}</Link>
                <ul className="mt-1.5 mb-3 ml-3 space-y-1.5 border-l border-line pl-3 text-muted">
                  {c.children.map((ch) => (
                    <li key={ch.id}><Link href={hrefWith(sp, { category: ch.slug })} className={cn("hover:text-ink hover:underline", category === ch.slug && "font-black text-ink underline decoration-2")}>{ch.name}</Link></li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-3 text-xs font-bold tracking-[0.2em] text-muted">尺寸<span className="ml-1 tracking-normal">（有庫存）</span></p>
          <div className="flex flex-wrap gap-1.5">
            {options.sizes.map((s) => (
              <Link key={s} href={hrefWith(sp, { size: filters.size === s ? undefined : s })} aria-pressed={filters.size === s} className={cn("min-w-10 text-center", chip(filters.size === s))}>{s}</Link>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-3 text-xs font-bold tracking-[0.2em] text-muted">顏色</p>
          <div className="flex flex-wrap gap-2">
            {options.colors.map((c) => (
              <Link
                key={c.color}
                title={c.color}
                aria-label={c.color}
                aria-pressed={filters.color === c.color}
                href={hrefWith(sp, { color: filters.color === c.color ? undefined : c.color })}
                className={cn("h-8 w-8 rounded-full ring-1 ring-ink/20 ring-offset-2 ring-offset-paper transition-transform hover:scale-110", filters.color === c.color && "ring-2 ring-ink")}
                style={{ background: c.colorHex }}
              />
            ))}
          </div>
        </div>
        <Link href={hrefWith(sp, { sale: filters.sale ? undefined : "1" })} aria-pressed={filters.sale} className={cn("inline-flex", chip(filters.sale), filters.sale && "border-mark bg-mark")}>
          {filters.sale ? "正在看特價・取消" : "只看特價"}
        </Link>
        {hasFilter && (
          <p><Link href={category ? `/products?category=${category}` : "/products"} className="text-muted underline">清除篩選</Link></p>
        )}
      </div>
    );
  }
}
