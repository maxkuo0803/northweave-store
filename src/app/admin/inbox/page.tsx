import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { formatDate } from "@/lib/store-config";
import { cn } from "@/lib/utils";
import { AGENT_MODEL, estimateCostUsd, isMockMode } from "@/lib/agent/config";
import { lineConfigured } from "@/lib/channels/line";
import { gmailConfigured } from "@/lib/channels/gmail";
import type { Channel, ConversationStatus } from "@/generated/prisma/enums";
import { ActionForm } from "@/components/ActionForm";
import { AutoRefresh } from "./AutoRefresh";
import { pollGmailAction } from "./actions";
import { CHANNEL_LABEL, ChannelBadge, ConvStatusBadge, STATUS_LABEL } from "./ui";

export const metadata: Metadata = { title: "客服中心" };

// 台北時間今天 00:00（台灣是 UTC+8、沒有夏令時間）
function taipeiToday() {
  const DAY = 86_400_000, TPE = 8 * 3_600_000;
  return new Date(Math.floor((Date.now() + TPE) / DAY) * DAY - TPE);
}

// 客服中心：所有平台（網站、LINE、Email）的對話集中在這裡
export default async function Inbox({ searchParams }: PageProps<"/admin/inbox">) {
  await requireStaff();
  const sp = await searchParams;
  const status = typeof sp.status === "string" && sp.status in STATUS_LABEL ? (sp.status as ConversationStatus) : undefined;
  const channel = typeof sp.channel === "string" && sp.channel in CHANNEL_LABEL ? (sp.channel as Channel) : undefined;

  const today = taipeiToday();
  const [convs, counts, usage, runs, handoffs] = await Promise.all([
    prisma.conversation.findMany({
      where: { ...(status && { status }), ...(channel && { channel }) },
      // 待人工的排最前面，其次是有未讀的
      orderBy: [{ staffUnread: "desc" }, { lastMessageAt: "desc" }],
      take: 60,
      include: {
        user: { select: { name: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1, select: { role: true, content: true } },
      },
    }),
    prisma.conversation.groupBy({ by: ["status"], _count: true }),
    prisma.agentStep.aggregate({ where: { createdAt: { gte: today }, type: "LLM" }, _sum: { inputTokens: true, outputTokens: true } }),
    prisma.agentStep.count({ where: { createdAt: { gte: today }, type: "GUARD" } }),
    prisma.agentStep.count({ where: { createdAt: { gte: today }, type: "HANDOFF" } }),
  ]);
  const count = (s: ConversationStatus) => counts.find((c) => c.status === s)?._count ?? 0;
  const inTok = usage._sum.inputTokens ?? 0;
  const outTok = usage._sum.outputTokens ?? 0;
  const href = (p: { status?: string; channel?: string }) => {
    const q = new URLSearchParams({ ...(status && { status }), ...(channel && { channel }), ...p });
    for (const [k, v] of [...q.entries()]) if (!v) q.delete(k);
    return `/admin/inbox${q.size ? `?${q}` : ""}`;
  };

  return (
    <div className="space-y-6">
      <AutoRefresh seconds={8} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">客服中心</h1>
          <p className="mt-1 text-sm text-muted">網站、LINE、Email 的對話都在這裡。AI 處理不了會自動轉到「待人工」。</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className={cn("badge", isMockMode() ? "bg-warn/15 text-warn" : "bg-ok/15 text-ok")}>AI：{isMockMode() ? "模擬模式（未設定 API Key）" : AGENT_MODEL}</span>
          <span className={cn("badge", lineConfigured() ? "bg-ok/15 text-ok" : "bg-ink/5 text-muted")}>LINE：{lineConfigured() ? "已連線" : "未設定"}</span>
          <span className={cn("badge", gmailConfigured() ? "bg-ok/15 text-ok" : "bg-ink/5 text-muted")}>Gmail：{gmailConfigured() ? "已連線" : "未設定"}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Link href={href({ status: "WAITING_HUMAN" })} className="card p-4 hover:ring-1 hover:ring-ink/20">
          <p className="text-xs text-muted">待人工接手</p>
          <p className="mt-1 font-marker text-3xl text-mark">{count("WAITING_HUMAN")}</p>
        </Link>
        <div className="card p-4">
          <p className="text-xs text-muted">今天 AI 回覆次數 / 轉人工</p>
          <p className="mt-1 font-marker text-3xl">{runs}<span className="text-lg text-muted"> / {handoffs}</span></p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-muted">今天用量（token）</p>
          <p className="mt-1 font-marker text-2xl">{(inTok + outTok).toLocaleString()}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-muted">今天預估費用</p>
          <p className="mt-1 font-marker text-2xl">US${estimateCostUsd(inTok, outTok).toFixed(4)}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link href={href({ status: "" })} className={cn("rounded-sm border px-3 py-1", !status ? "border-ink bg-ink text-white" : "border-line bg-card")}>全部</Link>
        {(Object.keys(STATUS_LABEL) as ConversationStatus[]).map((s) => (
          <Link key={s} href={href({ status: s })} className={cn("rounded-sm border px-3 py-1", status === s ? "border-ink bg-ink text-white" : "border-line bg-card")}>
            {STATUS_LABEL[s]}（{count(s)}）
          </Link>
        ))}
        <span className="mx-1 h-5 w-px bg-line" />
        {(Object.keys(CHANNEL_LABEL) as Channel[]).map((c) => (
          <Link key={c} href={href({ channel: channel === c ? "" : c })} className={cn("rounded-sm border px-3 py-1", channel === c ? "border-ink bg-ink text-white" : "border-line bg-card")}>
            {CHANNEL_LABEL[c]}
          </Link>
        ))}
        {gmailConfigured() && (
          <ActionForm action={pollGmailAction} submitLabel="立即收 Gmail" className="ml-auto flex items-center gap-2">
            {null}
          </ActionForm>
        )}
      </div>

      <div className="card divide-y divide-line overflow-hidden">
        {convs.map((c) => {
          const last = c.messages[0];
          return (
            <Link key={c.id} href={`/admin/inbox/${c.id}`} className={cn("flex items-start gap-3 p-4 hover:bg-sand/40", c.staffUnread && "bg-neon/15")}>
              <div className="w-20 shrink-0 space-y-1"><ChannelBadge channel={c.channel} /></div>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-bold">{c.displayName ?? "訪客"}</span>
                  {c.user ? <span className="text-xs text-ok">已驗證會員：{c.user.name}</span> : <span className="text-xs text-muted">未驗證</span>}
                  {c.staffUnread && <span className="badge bg-ink text-white">未讀</span>}
                </p>
                {c.subject && <p className="text-xs text-muted">主旨：{c.subject}</p>}
                <p className="mt-1 truncate text-sm text-muted">
                  {last ? `${{ CUSTOMER: "顧客", AI: "AI", STAFF: "客服", SYSTEM: "系統" }[last.role]}：${last.content}` : "（沒有訊息）"}
                </p>
                {c.status === "WAITING_HUMAN" && c.handoffReason && <p className="mt-1 truncate text-xs font-bold text-warn">轉人工原因：{c.handoffReason.split("\n")[0]}</p>}
              </div>
              <div className="shrink-0 space-y-1 text-right text-xs text-muted">
                <ConvStatusBadge status={c.status} />
                <p>{formatDate(c.lastMessageAt, true)}</p>
              </div>
            </Link>
          );
        })}
        {convs.length === 0 && <p className="p-8 text-center text-sm text-muted">目前沒有對話。到前台右下角「問小織」試試看。</p>}
      </div>
    </div>
  );
}
