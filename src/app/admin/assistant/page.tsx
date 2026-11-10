import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { formatPrice } from "@/lib/store-config";
import { cn } from "@/lib/utils";
import { estimateCostUsd } from "@/lib/agent/config";

export const metadata: Metadata = { title: "小織成效" };

// 入口代號 → 中文
const SOURCE_LABEL: Record<string, string> = {
  avatar: "點右下角頭像",
  greet: "進站招呼",
  nudge: "主動推薦泡泡",
  "size-hesitation": "尺寸猶豫提示",
  "product-chip": "商品頁「問店員」按鈕",
  "search-few": "搜尋結果太少",
  "search-empty": "搜尋找不到",
  "cart-freeship": "購物車湊免運",
  "order-chip": "訂單頁問題按鈕",
};

function since(days: number) {
  return new Date(Date.now() - days * 86_400_000);
}
const pct = (a: number, b: number) => (b ? `${Math.min(100, Math.round((a / b) * 100))}%` : "—");

// 小織成效：有多少人在用、從哪裡開始用、有沒有幫忙賣東西
export default async function AssistantStats({ searchParams }: PageProps<"/admin/assistant">) {
  await requireStaff();
  const sp = await searchParams;
  const days = sp.days === "30" ? 30 : 7;
  const from = since(days);
  const inRange = { createdAt: { gte: from } };

  const [browsers, chatVisitors, events, opensBySource, chipsBySource, convs, aiRuns, handoffs, llm, aiOrders] = await Promise.all([
    // 網站訪客：有瀏覽商品或有小織事件的隨機訪客 ID
    prisma.browseEvent.findMany({ where: inRange, distinct: ["visitorId"], select: { visitorId: true } }),
    prisma.chatEvent.findMany({ where: { ...inRange, visitorId: { not: null } }, distinct: ["visitorId"], select: { visitorId: true } }),
    prisma.chatEvent.groupBy({ by: ["type"], where: inRange, _count: true }),
    prisma.chatEvent.groupBy({ by: ["source"], where: { ...inRange, type: "open" }, _count: true }),
    prisma.chatEvent.groupBy({ by: ["source"], where: { ...inRange, type: "chip_click" }, _count: true }),
    // 有顧客實際傳訊息的對話（= 真的有在用小織）
    prisma.conversation.findMany({
      where: { messages: { some: { role: "CUSTOMER", ...inRange } } },
      select: { id: true, channel: true, userId: true, messages: { where: { role: "CUSTOMER", ...inRange }, orderBy: { createdAt: "asc" }, take: 1, select: { createdAt: true } } },
    }),
    prisma.agentStep.count({ where: { ...inRange, type: "GUARD" } }),
    prisma.agentStep.count({ where: { ...inRange, type: "HANDOFF" } }),
    prisma.agentStep.aggregate({ where: { ...inRange, type: "LLM" }, _sum: { inputTokens: true, outputTokens: true } }),
    prisma.chatEvent.aggregate({ where: { ...inRange, type: "order_placed" }, _count: true, _sum: { value: true } }),
  ]);

  const ev = (t: string) => events.find((e) => e.type === t)?._count ?? 0;
  const visitors = new Set([...browsers.map((b) => b.visitorId), ...chatVisitors.map((c) => c.visitorId!)]).size;
  const webChats = convs.filter((c) => c.channel === "WEB").length;

  // 轉換：聊過天的會員，聊天之後有沒有下單；跟同期間「沒聊過天」的活躍會員比較
  const chatted = new Map(convs.filter((c) => c.userId).map((c) => [c.userId!, c.messages[0]?.createdAt ?? from]));
  const activeMembers = await prisma.browseEvent.findMany({ where: { ...inRange, userId: { not: null } }, distinct: ["userId"], select: { userId: true } });
  const orders = await prisma.order.findMany({ where: { placedAt: { gte: from }, status: { not: "CANCELLED" } }, select: { userId: true, placedAt: true, total: true } });
  const chattedBuyers = new Set(orders.filter((o) => chatted.has(o.userId) && o.placedAt >= chatted.get(o.userId)!).map((o) => o.userId));
  const others = activeMembers.map((m) => m.userId!).filter((id) => !chatted.has(id));
  const otherBuyers = new Set(orders.filter((o) => others.includes(o.userId)).map((o) => o.userId));
  const chatRevenue = orders.filter((o) => chatted.has(o.userId) && o.placedAt >= chatted.get(o.userId)!).reduce((s, o) => s + o.total, 0);

  const inTok = llm._sum.inputTokens ?? 0;
  const outTok = llm._sum.outputTokens ?? 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">小織成效</h1>
          <p className="mt-1 text-sm text-muted">有多少人在用小織、從哪裡開始用、有沒有因此下單。只統計隨機訪客 ID 與會員 ID，不記錄 IP。</p>
        </div>
        <div className="flex gap-2 text-sm">
          {[7, 30].map((d) => (
            <Link key={d} href={`/admin/assistant?days=${d}`} className={cn("rounded-full border px-3 py-1", days === d ? "border-ink bg-ink text-white" : "border-line bg-card")}>
              近 {d} 天
            </Link>
          ))}
        </div>
      </div>

      <section>
        <h2 className="mb-3 font-bold">使用率</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="網站訪客" value={visitors} />
          <Stat
            label="網站上跟小織聊過的人"
            value={webChats}
            hint={webChats > visitors ? "訪客統計累積中，使用率稍後才準" : `使用率 ${pct(webChats, visitors)}`}
            strong
          />
          <Stat label="所有平台的對話（含 LINE / Email）" value={convs.length} />
          <Stat label="打開小織的次數" value={ev("open")} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-bold">對生意的幫助</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="聊過天的會員下單率" value={pct(chattedBuyers.size, chatted.size)} hint={`${chattedBuyers.size} / ${chatted.size} 人`} strong />
          <Stat label="沒聊過天的會員下單率" value={pct(otherBuyers.size, others.length)} hint={`${otherBuyers.size} / ${others.length} 人（對照組）`} />
          <Stat label="聊過天的會員下單金額" value={formatPrice(chatRevenue)} />
          <Stat label="小織直接代客下單" value={`${aiOrders._count} 筆`} hint={formatPrice(aiOrders._sum.value ?? 0)} />
        </div>
        <p className="mt-2 text-xs text-muted">「聊過天」只算會員在第一次跟小織說話之後的訂單。兩組人本來的購買意願就不同，數字是參考，不是因果。</p>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="font-bold">從哪裡打開小織</h2>
          <Bars rows={opensBySource.map((o) => ({ label: SOURCE_LABEL[o.source ?? ""] ?? o.source ?? "其他", value: o._count }))} />
        </section>
        <section className="card p-5">
          <h2 className="font-bold">主動出擊的效果</h2>
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr><th className="py-1">方式</th><th>出現</th><th>被點</th><th>點擊率</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              <Row label="進站招呼" shown={ev("greet_shown")} clicked={ev("greet_click")} />
              <Row label="主動推薦泡泡" shown={ev("nudge_shown")} clicked={opensBySource.find((o) => o.source === "nudge")?._count ?? 0} />
              <Row label="尺寸猶豫提示" shown={ev("hint_shown")} clicked={ev("hint_click")} />
            </tbody>
          </table>
          <h3 className="mt-5 text-sm font-bold">頁面裡的「問小織」按鈕</h3>
          <Bars rows={chipsBySource.map((o) => ({ label: SOURCE_LABEL[o.source ?? ""] ?? o.source ?? "其他", value: o._count }))} />
          <p className="mt-3 text-sm">顏色尺寸選擇器直接加入購物車：<b className="font-mono">{ev("picker_add")}</b> 次</p>
        </section>
      </div>

      <section className="card grid gap-4 p-5 text-sm sm:grid-cols-4">
        <div><p className="text-xs text-muted">AI 回覆</p><p className="font-mono text-xl">{aiRuns}</p></div>
        <div><p className="text-xs text-muted">轉人工</p><p className="font-mono text-xl">{handoffs}<span className="ml-1 text-sm text-muted">（{pct(handoffs, aiRuns)}）</span></p></div>
        <div><p className="text-xs text-muted">AI 費用</p><p className="font-mono text-xl">US${estimateCostUsd(inTok, outTok).toFixed(3)}</p></div>
        <div><p className="text-xs text-muted">平均每則回覆</p><p className="font-mono text-xl">US${aiRuns ? (estimateCostUsd(inTok, outTok) / aiRuns).toFixed(4) : "0"}</p></div>
      </section>
    </div>
  );
}

function Stat({ label, value, hint, strong }: { label: string; value: string | number; hint?: string; strong?: boolean }) {
  return (
    <div className={cn("card p-4", strong && "ring-1 ring-ink/15")}>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 font-mono text-2xl font-semibold">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

function Row({ label, shown, clicked }: { label: string; shown: number; clicked: number }) {
  return (
    <tr>
      <td className="py-1.5">{label}</td>
      <td className="font-mono">{shown}</td>
      <td className="font-mono">{clicked}</td>
      <td className="font-mono font-semibold">{pct(clicked, shown)}</td>
    </tr>
  );
}

// 橫條圖：長度 = 次數占最多那一項的比例
function Bars({ rows }: { rows: { label: string; value: number }[] }) {
  const sorted = [...rows].sort((a, b) => b.value - a.value);
  const max = Math.max(1, ...sorted.map((r) => r.value));
  if (!sorted.length) return <p className="mt-3 text-sm text-muted">還沒有資料。</p>;
  return (
    <ul className="mt-3 space-y-2 text-sm">
      {sorted.map((r) => (
        <li key={r.label}>
          <div className="flex justify-between"><span>{r.label}</span><span className="font-mono">{r.value}</span></div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-sand">
            <div className="h-full rounded-full bg-ink" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
