"use client";

import { useActionState, useState } from "react";
import { RETURN_REASON_LABEL } from "@/lib/store-config";
import { cn } from "@/lib/utils";
import { createReturnAction } from "../../orders/actions";

type Item = { id: string; name: string; variant: string; imageUrl: string; max: number; options: { id: string; label: string }[] };

export function ReturnForm({ orderNumber, items }: { orderNumber: string; items: Item[] }) {
  const [state, action, pending] = useActionState(createReturnAction, undefined);
  const [type, setType] = useState<"RETURN" | "EXCHANGE">("EXCHANGE");
  const [qty, setQty] = useState<Record<string, number>>({});

  return (
    <form action={action} className="mt-6 space-y-6">
      <input type="hidden" name="orderNumber" value={orderNumber} />
      <section>
        <h2 className="mb-3 font-bold">1. 選擇類型</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {([["EXCHANGE", "換貨", "換其他尺寸或顏色，尺寸不合第一次換貨免運"], ["RETURN", "退貨退款", "退回商品並退款到原付款方式"]] as const).map(([v, t, d]) => (
            <label key={v} className={cn("flex cursor-pointer gap-3 rounded-2xl border p-4 text-sm", type === v ? "border-brand bg-brand/5" : "border-line bg-card")}>
              <input type="radio" name="type" value={v} checked={type === v} onChange={() => setType(v)} className="mt-1" />
              <span><span className="font-medium">{t}</span><br /><span className="text-muted">{d}</span></span>
            </label>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-bold">2. 選擇商品</h2>
        <ul className="space-y-3">
          {items.map((it) => (
            <li key={it.id} className="card flex flex-wrap items-center gap-4 p-4 text-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={it.imageUrl} alt="" className="h-16 w-16 rounded-sm bg-sand" />
              <div className="min-w-40 flex-1">
                <p className="font-medium">{it.name}</p>
                <p className="text-muted">{it.variant}・可申請 {it.max} 件</p>
              </div>
              <label className="flex items-center gap-2 whitespace-nowrap">
                數量
                <select name={`qty_${it.id}`} value={qty[it.id] ?? 0} onChange={(e) => setQty({ ...qty, [it.id]: Number(e.target.value) })} className="input w-20">
                  {Array.from({ length: it.max + 1 }, (_, i) => <option key={i} value={i}>{i}</option>)}
                </select>
              </label>
              {type === "EXCHANGE" && (qty[it.id] ?? 0) > 0 && (
                <label className="flex w-full items-center gap-2 whitespace-nowrap sm:w-auto">
                  換成
                  {it.options.length > 0 ? (
                    <select name={`exchange_${it.id}`} className="input" required defaultValue="">
                      <option value="" disabled>選擇顏色 / 尺寸</option>
                      {it.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                  ) : (
                    <span className="text-bad">其他尺寸目前都缺貨，請改選退貨</span>
                  )}
                </label>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="reason">3. 原因</label>
          <select id="reason" name="reason" className="input" required defaultValue="">
            <option value="" disabled>請選擇</option>
            {Object.entries(RETURN_REASON_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="description">補充說明（選填）</label>
          <input id="description" name="description" maxLength={500} className="input" placeholder="例如：袖口有脫線" />
        </div>
      </section>

      {state?.error && <p className="rounded-sm bg-bad/10 px-3 py-2 text-sm text-bad">{state.error}</p>}
      <button className="btn-primary" disabled={pending}>{pending ? "送出中…" : "送出申請"}</button>
    </form>
  );
}
