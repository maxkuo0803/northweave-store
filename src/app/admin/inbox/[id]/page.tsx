import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { ORDER_STATUS_LABEL, formatDate, formatPrice } from "@/lib/store-config";
import { cn } from "@/lib/utils";
import { estimateCostUsd } from "@/lib/agent/config";
import { ActionForm } from "@/components/ActionForm";
import { AutoRefresh } from "../AutoRefresh";
import { closeConversationAction, markReadAction, returnToAiAction, staffReplyAction, takeOverAction } from "../actions";
import { CHANNEL_LABEL, ChannelBadge, ConvStatusBadge } from "../ui";

export const metadata: Metadata = { title: "客服對話" };

const STEP_STYLE: Record<string, { label: string; tone: string }> = {
  GUARD: { label: "安全檢查", tone: "bg-ink/10 text-ink" },
  LLM: { label: "AI 思考", tone: "bg-sky-100 text-sky-800" },
  TOOL: { label: "呼叫工具", tone: "bg-kraft/40 text-ink" },
  REPLY: { label: "回覆", tone: "bg-ok/15 text-ok" },
  HANDOFF: { label: "轉人工", tone: "bg-warn/15 text-warn" },
  ERROR: { label: "錯誤", tone: "bg-bad/10 text-bad" },
};
const ROLE_LABEL = { CUSTOMER: "顧客", AI: "AI 小織", STAFF: "真人客服", SYSTEM: "系統" } as const;

export default async function ConversationPage({ params }: PageProps<"/admin/inbox/[id]">) {
  await requireStaff();
  const { id } = await params;
  const conv = await prisma.conversation.findUnique({
    where: { id },
    include: {
      user: { select: { name: true, email: true, orders: { orderBy: { placedAt: "desc" }, take: 5, select: { orderNumber: true, status: true, total: true, placedAt: true } } } },
      messages: { orderBy: { createdAt: "asc" }, take: 200 },
      steps: { orderBy: [{ createdAt: "asc" }, { seq: "asc" }], take: 400 },
    },
  });
  if (!conv) notFound();

  // 依 runId 分組：一組 = AI 處理一則顧客訊息的完整過程
  const runs = new Map<string, typeof conv.steps>();
  for (const s of conv.steps) runs.set(s.runId, [...(runs.get(s.runId) ?? []), s]);
  const runList = [...runs.values()].reverse(); // 最新的在上面
  const staffIds = [...new Set(conv.messages.map((m) => m.staffId).filter(Boolean))] as string[];
  const staffNames = Object.fromEntries((await prisma.user.findMany({ where: { id: { in: staffIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));

  return (
    <div className="space-y-4">
      <AutoRefresh seconds={5} />
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/admin/inbox" className="text-sm underline">← 客服中心</Link>
        <h1 className="text-xl font-bold">{conv.displayName ?? "訪客"}</h1>
        <ChannelBadge channel={conv.channel} />
        <ConvStatusBadge status={conv.status} />
        <div className="ml-auto flex flex-wrap gap-2">
          {conv.staffUnread && <Btn action={markReadAction} id={conv.id} label="標為已讀" />}
          {conv.status !== "HUMAN" && <Btn action={takeOverAction} id={conv.id} label="接手（暫停 AI）" primary />}
          {conv.status !== "AI" && <Btn action={returnToAiAction} id={conv.id} label="交還 AI" />}
          {conv.status !== "CLOSED" && <Btn action={closeConversationAction} id={conv.id} label="結束對話" />}
        </div>
      </div>

      {conv.status === "WAITING_HUMAN" && conv.handoffReason && (
        <div className="neon-card p-4 text-sm whitespace-pre-wrap">
          <p className="font-black">AI 轉人工原因</p>
          {conv.handoffReason}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
        {/* 左：對話內容 + 回覆 */}
        <section className="card flex flex-col">
          <div className="max-h-[60vh] flex-1 space-y-3 overflow-y-auto p-4">
            {conv.messages.map((m) => (
              <div key={m.id} className={cn("flex flex-col", m.role === "CUSTOMER" ? "items-start" : m.role === "SYSTEM" ? "items-center" : "items-end")}>
                <p className="mb-0.5 text-[11px] text-muted">
                  {m.role === "STAFF" ? `真人客服 ${staffNames[m.staffId ?? ""] ?? ""}` : ROLE_LABEL[m.role]}・{formatDate(m.createdAt, true)}
                  {m.delivery === "FAILED" && <span className="ml-1 font-bold text-bad">送出失敗：{m.deliveryError}</span>}
                </p>
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed break-words whitespace-pre-wrap",
                    m.role === "CUSTOMER" && "border border-line bg-white",
                    m.role === "AI" && "bg-ink text-white",
                    m.role === "STAFF" && "bg-neon text-ink",
                    m.role === "SYSTEM" && "bg-transparent text-xs text-muted",
                  )}
                >
                  {m.content}
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-line p-4">
            <ActionForm action={staffReplyAction} submitLabel={`用 ${CHANNEL_LABEL[conv.channel]} 回覆`} className="space-y-2" resetOnSuccess>
              <input type="hidden" name="id" value={conv.id} />
              <label htmlFor="reply" className="label">真人回覆（送出後 AI 會暫停，直到按「交還 AI」）</label>
              <textarea id="reply" name="text" rows={3} maxLength={2000} required className="input" placeholder="輸入回覆內容…" />
            </ActionForm>
          </div>
        </section>

        {/* 右：顧客資料 + AI 步驟追蹤 */}
        <aside className="space-y-4">
          <section className="card p-4 text-sm">
            <h2 className="font-black">顧客</h2>
            <dl className="mt-2 grid grid-cols-[5rem_1fr] gap-y-1">
              <dt className="text-muted">平台</dt><dd>{CHANNEL_LABEL[conv.channel]}</dd>
              <dt className="text-muted">平台 ID</dt><dd className="truncate font-mono text-xs">{conv.externalId}</dd>
              <dt className="text-muted">身分</dt>
              <dd>{conv.user ? <span className="text-ok">已驗證：{conv.user.name}（{conv.user.email}）</span> : <span className="text-muted">未驗證，AI 不會透露訂單</span>}</dd>
              {conv.subject && (<><dt className="text-muted">主旨</dt><dd>{conv.subject}</dd></>)}
            </dl>
            {conv.user && conv.user.orders.length > 0 && (
              <ul className="mt-3 space-y-1 border-t border-line pt-3">
                {conv.user.orders.map((o) => (
                  <li key={o.orderNumber} className="flex justify-between gap-2">
                    <Link href={`/admin/orders/${o.orderNumber}`} className="font-mono text-xs underline">{o.orderNumber}</Link>
                    <span className="text-xs text-muted">{ORDER_STATUS_LABEL[o.status]}・{formatPrice(o.total)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-4">
            <h2 className="font-black">AI 步驟追蹤</h2>
            <p className="text-xs text-muted">每則顧客訊息，AI 做了哪些檢查、查了哪些資料、花了多少。點開可看完整輸入輸出。</p>
            <div className="mt-3 max-h-[70vh] space-y-4 overflow-y-auto pr-1">
              {runList.map((steps) => {
                const inTok = steps.reduce((s, x) => s + x.inputTokens, 0);
                const outTok = steps.reduce((s, x) => s + x.outputTokens, 0);
                const ms = steps.reduce((s, x) => s + x.latencyMs, 0);
                const trigger = (steps[0].input as { message?: string } | null)?.message;
                return (
                  <div key={steps[0].runId} className="rounded-2xl border border-line bg-white p-3">
                    <p className="text-xs text-muted">{formatDate(steps[0].createdAt, true)}・{(ms / 1000).toFixed(1)} 秒・{(inTok + outTok).toLocaleString()} token・US${estimateCostUsd(inTok, outTok).toFixed(5)}</p>
                    {trigger && <p className="mt-1 line-clamp-2 text-sm font-bold">「{trigger}」</p>}
                    <ol className="mt-2 space-y-1.5 border-l-2 border-line pl-3">
                      {steps.map((s) => {
                        const st = STEP_STYLE[s.type] ?? { label: s.type, tone: "bg-ink/10" };
                        return (
                          <li key={s.id} className="text-xs">
                            <details>
                              <summary className="flex cursor-pointer list-none items-center gap-2">
                                <span className={cn("badge shrink-0", st.tone)}>{st.label}</span>
                                <span className="min-w-0 flex-1 truncate font-mono">{s.name}</span>
                                {s.latencyMs > 0 && <span className="text-muted">{s.latencyMs}ms</span>}
                              </summary>
                              <div className="mt-1 space-y-1">
                                {s.input != null && <Json label="輸入" value={s.input} />}
                                {s.output != null && <Json label="輸出" value={s.output} />}
                                {s.inputTokens + s.outputTokens > 0 && <p className="text-muted">token：輸入 {s.inputTokens}、輸出 {s.outputTokens}</p>}
                              </div>
                            </details>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                );
              })}
              {runList.length === 0 && <p className="text-sm text-muted">還沒有 AI 紀錄。</p>}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Json({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <p className="font-bold text-muted">{label}</p>
      <pre className="max-h-60 overflow-auto rounded-lg bg-paper p-2 text-[11px] leading-snug whitespace-pre-wrap">{JSON.stringify(value, null, 2)}</pre>
    </div>
  );
}

function Btn({ action, id, label, primary }: { action: (fd: FormData) => Promise<void>; id: string; label: string; primary?: boolean }) {
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <button className={cn(primary ? "btn-primary" : "btn-outline", "px-3 py-1.5 text-xs")}>{label}</button>
    </form>
  );
}
