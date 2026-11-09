import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { ingestCustomerMessage } from "@/lib/agent/conversations";
import { respond } from "@/lib/agent/run";
import { LIMITS } from "@/lib/agent/config";

// 作品集網站的「小織」試玩 API（跨網站呼叫）
// 作品集頁面（另一個網域）可以直接跟小織聊天，並即時看到 AI 每一步在做什麼（節點動畫）。
//
// POST /api/demo-chat              { sid, text } → 跑完 AI 回覆，回傳新訊息 + 這次的步驟
// GET  /api/demo-chat?sid=…        → 這段對話「最新一次」回覆的步驟（AI 思考時前端每 0.5 秒問一次）
//
// 安全：
// - 只允許作品集網域的瀏覽器呼叫（CORS 白名單）
// - 訪客一律是「未驗證身分」：AI 只能查商品、規則、知識庫，不能看任何訂單或會員資料
// - 沿用原本的限流（每段對話每分鐘、每人每天、全站每天上限），另外再限制每個 IP
// - 回傳的步驟只留「給人看的摘要」，不回傳系統提示詞或完整工具結果

export const maxDuration = 30;

// 允許呼叫的網站。可以用環境變數 DEMO_CHAT_ORIGINS（逗號分隔）覆蓋
const ORIGINS = (process.env.DEMO_CHAT_ORIGINS ?? "https://max-ai-portfolio-tau.vercel.app,https://max-ai-portfolio-max-0c94.vercel.app")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
// 開發時也允許本機的作品集預覽
if (process.env.NODE_ENV === "development") ORIGINS.push("http://localhost:8765");

function corsHeaders(req: Request): Record<string, string> | null {
  const origin = req.headers.get("origin");
  if (!origin || !ORIGINS.includes(origin)) return null;
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}
const json = (body: unknown, cors: Record<string, string>, status = 200) => NextResponse.json(body, { status, headers: cors });
const forbidden = () => NextResponse.json({ error: "forbidden" }, { status: 403 });

// 瀏覽器正式送出前會先問「可以跨網站呼叫嗎？」（preflight）
export function OPTIONS(req: Request) {
  const cors = corsHeaders(req);
  return cors ? new NextResponse(null, { status: 204, headers: cors }) : forbidden();
}

// sid：作品集頁面產生的隨機字串，代表「這位訪客的這段對話」
const sidSchema = z.string().regex(/^[A-Za-z0-9-]{16,64}$/);
const bodySchema = z.object({ sid: sidSchema, text: z.string().trim().min(1).max(LIMITS.maxInputChars) });
const externalId = (sid: string) => `demo:${sid}`;

function findConversation(sid: string) {
  return prisma.conversation.findUnique({ where: { channel_externalId: { channel: "WEB", externalId: externalId(sid) } } });
}

// ── 步驟摘要：資料庫裡的 AgentStep → 前端節點動畫要的格式 ──
type Step = { type: string; name: string; input: unknown; output: unknown; inputTokens: number; outputTokens: number; latencyMs: number };
const short = (v: unknown, n = 80) => (typeof v === "string" ? (v.length > n ? v.slice(0, n) + "…" : v) : undefined);

function publicStep(s: Step) {
  const out = (s.output ?? {}) as Record<string, unknown>;
  const inp = (s.input ?? {}) as Record<string, unknown>;
  let detail: Record<string, unknown> = {};
  switch (s.type) {
    case "GUARD":
      detail = { handoffTrigger: out.handoffTrigger ?? null, promptInjection: !!out.promptInjection, rateLimit: out.rateLimit, budget: out.dailyBudget, model: out.mode };
      break;
    case "LLM":
      detail = { stop: out.stop_reason, toolCalls: out.toolCalls };
      break;
    case "TOOL": {
      detail = { query: short(inp.query) ?? short(inp.code) ?? short(inp.basedOnCode) };
      const retrieval = (out.retrieval ?? null) as Record<string, unknown> | null;
      if (retrieval) detail.retrieval = { mode: retrieval.mode, candidates: retrieval.candidates, ms: retrieval.ms };
      // 知識庫：前幾名的標題 + 各階段分數（BM25 / 向量 / rerank）
      const hits = (Array.isArray(out.results) ? out.results : Array.isArray(retrieval?.matched) ? retrieval.matched : []) as { title?: string; scores?: Record<string, number | null> }[];
      if (hits.length) detail.hits = hits.slice(0, 3).map((h) => ({ title: short(h.title, 40), scores: h.scores }));
      if (Array.isArray(out.products)) detail.products = (out.products as { code?: string; name?: string }[]).slice(0, 4).map((p) => `${p.code} ${p.name}`);
      if (out.error) detail.error = short(out.error);
      break;
    }
    case "HANDOFF":
      detail = { reason: short(out.reason) };
      break;
    case "REPLY":
      detail = s.name === "附件" ? {} : { issues: out.outputIssues ?? null };
      break;
  }
  return { type: s.type, name: s.name, ms: s.latencyMs, tokens: s.inputTokens + s.outputTokens, detail };
}

async function latestRun(conversationId: string) {
  const last = await prisma.agentStep.findFirst({ where: { conversationId }, orderBy: [{ createdAt: "desc" }, { seq: "desc" }], select: { runId: true } });
  if (!last) return { runId: null, steps: [] };
  const steps = await prisma.agentStep.findMany({ where: { runId: last.runId }, orderBy: { seq: "asc" } });
  return { runId: last.runId, steps: steps.map(publicStep) };
}

export async function GET(req: Request) {
  const cors = corsHeaders(req);
  if (!cors) return forbidden();
  const sid = sidSchema.safeParse(new URL(req.url).searchParams.get("sid"));
  if (!sid.success) return json({ error: "bad sid" }, cors, 400);
  const conv = await findConversation(sid.data);
  if (!conv) return json({ runId: null, steps: [] }, cors);
  return json(await latestRun(conv.id), cors);
}

export async function POST(req: Request) {
  const cors = corsHeaders(req);
  if (!cors) return forbidden();
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: `訊息請在 ${LIMITS.maxInputChars} 字以內` }, cors, 400);

  // 每個 IP：每分鐘 10 則、每天 40 則（作品集試玩用，夠了）
  const ip = await clientIp();
  if (!(await rateLimit(`demo:ip:${ip}`, 10, 60)) || !(await rateLimit(`demo:ip-day:${ip}`, 40, 86_400))) {
    return json({ error: "訊息太頻繁，請稍後再試" }, cors, 429);
  }

  const { conversation, message } = await ingestCustomerMessage({
    channel: "WEB",
    externalId: externalId(parsed.data.sid),
    text: parsed.data.text,
    userId: null, // 作品集訪客永遠是「未驗證」
    displayName: "作品集訪客",
  });
  await respond(conversation.id, { visitorId: null });

  const messages = await prisma.message.findMany({
    where: { conversationId: conversation.id, createdAt: { gte: message.createdAt } },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, content: true, attachments: true, createdAt: true },
  });
  const status = (await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id }, select: { status: true } })).status;
  return json({ status, messages, ...(await latestRun(conversation.id)) }, cors);
}
