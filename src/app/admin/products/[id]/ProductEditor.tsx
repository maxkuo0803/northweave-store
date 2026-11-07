"use client";

import { useActionState } from "react";
import { updateProductAction } from "../../actions";

type P = { id: string; name: string; price: number; salePrice: number | null; status: string; description: string; isFeatured: boolean; image?: string };
type V = { id: string; sku: string; color: string; colorHex: string; size: string; stock: number };

export function ProductEditor({ product, variants }: { product: P; variants: V[] }) {
  const [state, action, pending] = useActionState(updateProductAction, undefined);
  const colors = [...new Set(variants.map((v) => v.color))];
  const sizes = [...new Set(variants.map((v) => v.size))];

  return (
    <form action={action} className="mt-6 grid gap-6 lg:grid-cols-[1fr_1fr]">
      <input type="hidden" name="id" value={product.id} />
      <section className="card space-y-4 p-5">
        <h2 className="font-bold">基本資料</h2>
        <div><label className="label" htmlFor="name">名稱</label><input id="name" name="name" defaultValue={product.name} className="input" required /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label" htmlFor="price">原價</label><input id="price" name="price" type="number" min={1} defaultValue={product.price} className="input" required /></div>
          <div><label className="label" htmlFor="salePrice">特價（空白 = 無）</label><input id="salePrice" name="salePrice" type="number" min={1} defaultValue={product.salePrice ?? ""} className="input" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="status">狀態</label>
            <select id="status" name="status" defaultValue={product.status} className="input">
              <option value="ACTIVE">上架中</option><option value="DRAFT">草稿</option><option value="ARCHIVED">已下架</option>
            </select>
          </div>
          <label className="mt-6 flex items-center gap-2 text-sm"><input type="checkbox" name="isFeatured" defaultChecked={product.isFeatured} /> 首頁推薦</label>
        </div>
        <div><label className="label" htmlFor="description">描述</label><textarea id="description" name="description" rows={4} defaultValue={product.description} className="input" required /></div>
      </section>
      <section className="card p-5">
        <h2 className="font-bold">庫存（顏色 × 尺寸）</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="text-sm">
            <thead><tr><th className="pr-3 text-left text-xs text-muted">顏色</th>{sizes.map((s) => <th key={s} className="px-1 text-xs text-muted">{s}</th>)}</tr></thead>
            <tbody>
              {colors.map((c) => (
                <tr key={c}>
                  <td className="py-1 pr-3 whitespace-nowrap">
                    <span className="mr-2 inline-block h-3 w-3 rounded-full border border-ink/15" style={{ background: variants.find((v) => v.color === c)?.colorHex }} />{c}
                  </td>
                  {sizes.map((s) => {
                    const v = variants.find((x) => x.color === c && x.size === s);
                    return (
                      <td key={s} className="px-1">
                        {v && <input name={`stock_${v.id}`} type="number" min={0} defaultValue={v.stock} title={v.sku} aria-label={`${c} ${s} 庫存`} className={`input w-16 px-2 py-1 text-center ${v.stock === 0 ? "border-bad/50 text-bad" : ""}`} />}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="flex items-center gap-3 lg:col-span-2">
        <button className="btn-primary" disabled={pending}>{pending ? "儲存中…" : "儲存變更"}</button>
        {state?.error && <span className="text-sm text-bad">{state.error}</span>}
        {state?.ok && <span className="text-sm text-ok">{state.ok}</span>}
      </div>
    </form>
  );
}
