import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getOrderForUser, returnDeadline, returnEligibility, returnableQuantities } from "@/lib/orders";
import { createReturn } from "@/lib/returns";
import { recommendFor } from "@/lib/recommend";
import { sizeChartFor } from "@/lib/size-chart";
import {
  ORDER_STATUS_LABEL, PAYMENT_METHOD_LABEL, RETURN_REASON_LABEL, RETURN_STATUS_LABEL, RETURN_TYPE_LABEL,
  RETURN_WINDOW_DAYS, SHIPPING, SHIPPING_METHOD_LABEL, STORE, formatDate,
} from "@/lib/store-config";
import type { Channel } from "@/generated/prisma/enums";
import { maskName, maskPhone } from "./guard";

// AI 能用的「工具」= 我們寫好的函式。AI 只能透過這些函式碰資料，
// 所以它能看到什麼、能做什麼，完全由這個檔案決定（最重要的安全邊界）。
//
// 原則：
// 1. 跟會員有關的工具一律用「已驗證的 userId」查，不接受 AI 傳進來的 userId / email。
// 2. 只回傳回答問題需要的欄位（地址、電話會遮罩，庫存只說有沒有貨，不說確切數字）。
// 3. 會改資料的動作（建立退換貨）分兩步：先提案 → 顧客在下一則訊息確認 → 才執行，由程式檢查，不靠 AI 自律。

export type AgentContext = {
  conversationId: string;
  channel: Channel;
  userId: string | null; // 已驗證身分的會員；null = 不知道是誰
  visitorId: string | null;
  currentPath?: string | null;
};

type ToolDef = {
  description: string;
  schema: z.ZodObject;
  needsUser?: boolean; // 需要先驗證會員身分
  run: (input: never, ctx: AgentContext) => Promise<unknown>;
};

const SITE = () => process.env.BETTER_AUTH_URL || "http://localhost:3000";

function verifyHint(channel: Channel) {
  if (channel === "WEB") return "請先登入會員（右上角「登入」），登入後就能查訂單。";
  if (channel === "LINE") return `請先到網站登入 → 會員中心 → 「綁定 LINE」，取得 6 位數綁定碼後傳到這個 LINE 對話。網址：${SITE()}/account`;
  return "請改用「註冊會員時的 Email」寄信過來，系統驗證寄件者後就能查詢。";
}

const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "F"];

const TOOLS = {
  search_products: {
    description: "搜尋商品。可以用關鍵字、分類、價格上限、尺寸篩選。回傳商品編號、名稱、價格、網址。",
    schema: z.object({
      query: z.string().max(50).optional().describe("關鍵字，例如：亞麻、襯衫、NW012"),
      category: z.enum(["men", "women", "accessories"]).optional(),
      maxPrice: z.number().int().positive().optional(),
      size: z.enum(["XS", "S", "M", "L", "XL"]).optional().describe("只要這個尺寸有庫存的"),
      onSaleOnly: z.boolean().optional(),
    }),
    run: async (i: { query?: string; category?: string; maxPrice?: number; size?: string; onSaleOnly?: boolean }) => {
      const products = await prisma.product.findMany({
        where: {
          status: "ACTIVE",
          ...(i.query && { OR: [{ name: { contains: i.query } }, { description: { contains: i.query } }, { material: { contains: i.query } }, { slug: { startsWith: i.query.toLowerCase() } }] }),
          ...(i.category && { category: { OR: [{ slug: i.category }, { parent: { slug: i.category } }] } }),
          ...(i.onSaleOnly && { salePrice: { not: null } }),
          ...(i.maxPrice && { OR: [{ salePrice: { lte: i.maxPrice } }, { salePrice: null, price: { lte: i.maxPrice } }] }),
          variants: { some: { stock: { gt: 0 }, ...(i.size && { size: i.size }) } },
        },
        take: 6,
        select: { slug: true, name: true, price: true, salePrice: true, material: true },
      });
      return { count: products.length, products: products.map(productBrief) };
    },
  },

  get_product: {
    description: "查一件商品的詳細資訊：材質、洗滌、尺寸表（公分）、各顏色尺寸有沒有貨、評價與尺寸回饋。用商品編號（NW001）或網址代號。",
    schema: z.object({ code: z.string().max(60).describe("商品編號，例如 NW012；或網址最後一段") }),
    run: async (i: { code: string }) => {
      const code = i.code.trim().toLowerCase().replace(/^.*\/products\//, "");
      const p = await prisma.product.findFirst({
        where: { status: "ACTIVE", OR: [{ slug: code }, { slug: { startsWith: code + "-" } }] },
        include: { variants: true, reviews: { select: { rating: true, fit: true } }, category: { select: { name: true } } },
      });
      if (!p) return { error: "找不到這個商品" };
      const colors = [...new Set(p.variants.map((v) => v.color))].map((color) => ({
        color,
        sizes: p.variants
          .filter((v) => v.color === color)
          .sort((a, b) => SIZE_ORDER.indexOf(a.size) - SIZE_ORDER.indexOf(b.size))
          // 不透露確切庫存，只說有貨 / 少量 / 售完
          .map((v) => `${v.size}:${v.stock === 0 ? "售完" : v.stock <= 3 ? "少量" : "有貨"}`)
          .join(" "),
      }));
      const fit = { SMALL: 0, TRUE: 0, LARGE: 0 } as Record<string, number>;
      p.reviews.forEach((r) => r.fit && fit[r.fit]++);
      const n = p.reviews.length;
      return {
        ...productBrief(p),
        category: p.category.name,
        description: p.description,
        material: p.material,
        care: p.care,
        colors,
        // 尺寸表（公分，平量）：顧客問「我該穿哪個尺寸」時用來比對
        sizeChart: (() => {
          const chart = sizeChartFor(p.garmentType, p.variants.map((v) => v.size));
          if (!chart) return "單一尺寸（F）";
          const isBottom = chart[0][1] === "腰圍";
          return {
            // 把單位講清楚，AI 才不會把「吋」和「公分」搞混
            note: isBottom
              ? "尺寸欄斜線後的數字是腰圍「吋」數；腰圍、臀圍、褲長是平量「公分」。商品若用 28、30、32 這種數字當尺寸，那就是腰圍吋數（1 吋 ≈ 2.54 公分）。"
              : "胸寬、衣長、肩寬都是平放測量的「公分」（胸寬 × 2 ≈ 胸圍）。",
            rows: chart.map((row) => row.join(" / ")),
          };
        })(),
        reviews: n ? { count: n, average: +(p.reviews.reduce((s, r) => s + r.rating, 0) / n).toFixed(1), fit: `偏小 ${fit.SMALL}、剛好 ${fit.TRUE}、偏大 ${fit.LARGE}` } : null,
      };
    },
  },

  recommend_products: {
    description: "根據顧客的瀏覽紀錄與正在看的商品，推薦可以搭配的商品。顧客問「推薦」「怎麼搭」時使用。",
    schema: z.object({ basedOnCode: z.string().max(60).optional().describe("以這件商品為基礎推薦（可省略）") }),
    run: async (i: { basedOnCode?: string }, ctx) => {
      let currentProductId: string | undefined;
      const slug = i.basedOnCode?.toLowerCase() ?? ctx.currentPath?.match(/^\/products\/([^/?]+)/)?.[1];
      if (slug) currentProductId = (await prisma.product.findFirst({ where: { OR: [{ slug }, { slug: { startsWith: slug + "-" } }] }, select: { id: true } }))?.id;
      const rec = await recommendFor({ visitorId: ctx.visitorId, userId: ctx.userId }, { currentProductId, take: 4 });
      return { reason: rec.reason, products: rec.products.map(productBrief) };
    },
  },

  search_faq: {
    description: "查詢常見問題（付款、運送、退換貨、會員、商品保養）。回答規則類問題前先查。",
    schema: z.object({ query: z.string().max(100) }),
    run: async (i: { query: string }) => {
      const faqs = await prisma.faq.findMany();
      // 中文沒有空格，用「兩個字一組」比對相似度
      const grams = (s: string) => new Set(Array.from({ length: Math.max(0, s.length - 1) }, (_, k) => s.slice(k, k + 2)));
      const q = grams(i.query.replace(/\s/g, ""));
      const scored = faqs
        .map((f) => { const g = grams(f.question + f.answer); return { f, score: [...q].filter((x) => g.has(x)).length }; })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
      return { results: scored.map(({ f }) => ({ category: f.category, question: f.question, answer: f.answer })) };
    },
  },

  get_store_policies: {
    description: "商店基本規則：運費、免運門檻、鑑賞期、付款方式、客服時間與聯絡方式。",
    schema: z.object({}),
    run: async () => ({
      store: STORE.name,
      serviceHours: STORE.serviceHours,
      servicePhone: STORE.servicePhone,
      serviceEmail: STORE.serviceEmail,
      shipping: { freeThreshold: SHIPPING.freeThreshold, home: `${SHIPPING.carriers.HOME} NT$${SHIPPING.fee.HOME}`, cvs: `${SHIPPING.carriers.CVS} NT$${SHIPPING.fee.CVS}` },
      returns: `收到商品隔天起算 ${RETURN_WINDOW_DAYS} 天鑑賞期內可申請退貨或換尺寸/顏色；商品需保持全新、吊牌未拆。退款於收到退回商品後 3–5 個工作天退回原付款方式。`,
      payments: Object.values(PAYMENT_METHOD_LABEL),
    }),
  },

  list_my_orders: {
    description: "列出這位會員最近的訂單（編號、狀態、金額、日期）。",
    needsUser: true,
    schema: z.object({}),
    run: async (_: object, ctx) => {
      const orders = await prisma.order.findMany({
        where: { userId: ctx.userId! },
        orderBy: { placedAt: "desc" },
        take: 8,
        include: { items: { select: { productName: true, quantity: true } } },
      });
      return {
        orders: orders.map((o) => ({
          orderNumber: o.orderNumber,
          status: ORDER_STATUS_LABEL[o.status],
          placedAt: formatDate(o.placedAt),
          total: o.total,
          items: o.items.map((i) => `${i.productName} x${i.quantity}`).join("、"),
        })),
      };
    },
  },

  get_order_detail: {
    description: "查一張訂單的詳細狀態：商品明細、物流單號、進度、能不能退換貨。",
    needsUser: true,
    schema: z.object({ orderNumber: z.string().max(30) }),
    run: async (i: { orderNumber: string }, ctx) => {
      const o = await getOrderForUser(i.orderNumber.trim().toUpperCase(), ctx.userId!);
      if (!o) return { error: "這個帳號底下找不到這張訂單" };
      const eligible = returnEligibility(o);
      return {
        orderNumber: o.orderNumber,
        status: ORDER_STATUS_LABEL[o.status],
        placedAt: formatDate(o.placedAt, true),
        payment: PAYMENT_METHOD_LABEL[o.paymentMethod],
        shipping: SHIPPING_METHOD_LABEL[o.shippingMethod],
        carrier: o.carrier,
        trackingNumber: o.trackingNumber,
        // 收件資料遮罩：只要讓顧客認得出是哪一筆就好
        recipient: `${maskName(o.recipientName)} ${maskPhone(o.recipientPhone)}`,
        total: o.total,
        items: o.items.map((it) => ({ name: it.productName, color: it.color, size: it.size, quantity: it.quantity, unitPrice: it.unitPrice })),
        timeline: o.history.map((h) => `${formatDate(h.createdAt, true)} ${ORDER_STATUS_LABEL[h.status]}${h.note ? `（${h.note}）` : ""}`),
        returnable: eligible.ok ? `可以申請，期限 ${formatDate(eligible.deadline)}` : `不能申請：${eligible.reason}`,
        url: `${SITE()}/account/orders/${o.orderNumber}`,
      };
    },
  },

  check_return_options: {
    description: "退換貨前先呼叫：檢查訂單是否在鑑賞期內、每件商品還能退幾件、換貨可以換哪些顏色尺寸（含 variantId）。",
    needsUser: true,
    schema: z.object({ orderNumber: z.string().max(30) }),
    run: async (i: { orderNumber: string }, ctx) => {
      const o = await getOrderForUser(i.orderNumber.trim().toUpperCase(), ctx.userId!);
      if (!o) return { error: "這個帳號底下找不到這張訂單" };
      const eligible = returnEligibility(o);
      if (!eligible.ok) return { eligible: false, reason: eligible.reason, deadline: returnDeadline(o) && formatDate(returnDeadline(o)!) };
      const remaining = returnableQuantities(o);
      const items = await Promise.all(
        o.items.map(async (it) => ({
          orderItemId: it.id,
          name: it.productName,
          bought: `${it.color} / ${it.size}`,
          returnableQuantity: remaining[it.id],
          exchangeOptions: it.variant
            ? (await prisma.productVariant.findMany({ where: { productId: it.variant.productId, stock: { gt: 0 }, id: { not: it.variantId ?? "" } }, select: { id: true, color: true, size: true } }))
                .map((v) => ({ variantId: v.id, color: v.color, size: v.size }))
            : [],
        })),
      );
      return {
        eligible: true,
        deadline: formatDate(eligible.deadline),
        reasons: RETURN_REASON_LABEL,
        items: items.filter((x) => x.returnableQuantity > 0),
      };
    },
  },

  propose_return: {
    description:
      "準備一筆退貨或換貨申請（還不會送出）。會先依規則檢查，通過後請把內容清楚告訴顧客，請顧客回覆「確認」；顧客確認後再呼叫 confirm_pending_action。",
    needsUser: true,
    schema: z.object({
      orderNumber: z.string().max(30),
      type: z.enum(["RETURN", "EXCHANGE"]),
      reason: z.enum(["SIZE_TOO_SMALL", "SIZE_TOO_LARGE", "DEFECTIVE", "WRONG_ITEM", "NOT_AS_DESCRIBED", "CHANGED_MIND"]),
      description: z.string().max(300).optional(),
      items: z.array(z.object({ orderItemId: z.string(), quantity: z.number().int().positive(), exchangeVariantId: z.string().optional() })).min(1).max(10),
    }),
    run: async (i: { orderNumber: string; type: "RETURN" | "EXCHANGE"; reason: keyof typeof RETURN_REASON_LABEL; description?: string; items: { orderItemId: string; quantity: number; exchangeVariantId?: string }[] }, ctx) => {
      const input = { ...i, orderNumber: i.orderNumber.trim().toUpperCase() };
      const check = await createReturn(ctx.userId!, input, { dryRun: true });
      if (!check.ok) return { ok: false, error: check.error };
      await prisma.conversation.update({
        where: { id: ctx.conversationId },
        data: { pendingAction: { kind: "CREATE_RETURN", payload: input, createdAt: new Date().toISOString() } },
      });
      return {
        ok: true,
        next: "已暫存，尚未送出。請用條列向顧客確認：訂單編號、退貨或換貨、商品與數量（換貨要寫換成什麼）、原因，並請顧客回覆「確認」。",
        summary: { orderNumber: input.orderNumber, type: RETURN_TYPE_LABEL[i.type], reason: RETURN_REASON_LABEL[i.reason] },
      };
    },
  },

  confirm_pending_action: {
    description: "顧客明確回覆確認之後，送出先前 propose_return 暫存的申請。顧客還沒確認前不可以呼叫。",
    needsUser: true,
    schema: z.object({}),
    run: async (_: object, ctx) => {
      const conv = await prisma.conversation.findUnique({ where: { id: ctx.conversationId }, select: { pendingAction: true } });
      const pending = conv?.pendingAction as { kind: string; payload: Parameters<typeof createReturn>[1]; createdAt: string } | null;
      if (!pending) return { ok: false, error: "沒有等待確認的申請" };
      // 程式檢查：暫存之後，顧客真的有再傳一則「確認」類的訊息（不能由 AI 自己決定顧客同意了）
      const after = await prisma.message.findFirst({
        where: { conversationId: ctx.conversationId, role: "CUSTOMER", createdAt: { gt: new Date(pending.createdAt) } },
        orderBy: { createdAt: "desc" },
      });
      if (!after) return { ok: false, error: "顧客還沒回覆，請先等顧客確認" };
      if (!/(確認|確定|好|是的|對|沒問題|可以|麻煩|ok|yes|送出)/i.test(after.content) || /(不要|不用了|取消|等等|不對|不是|先不)/.test(after.content)) {
        return { ok: false, error: "顧客的回覆不是明確的確認，請再問一次，或詢問要修改哪裡" };
      }
      if (Date.now() - new Date(pending.createdAt).getTime() > 30 * 60_000) {
        await prisma.conversation.update({ where: { id: ctx.conversationId }, data: { pendingAction: Prisma.DbNull } });
        return { ok: false, error: "確認已超過 30 分鐘，請重新建立申請" };
      }
      const r = await createReturn(ctx.userId!, pending.payload, { note: `由 AI 客服代為申請（${ctx.channel}）` });
      await prisma.conversation.update({ where: { id: ctx.conversationId }, data: { pendingAction: Prisma.DbNull } });
      if (!r.ok) return { ok: false, error: r.error };
      return {
        ok: true,
        rmaNumber: r.rmaNumber,
        next: "申請已送出，等待客服審核（1–2 個工作天）。核准後會通知寄回方式。",
        url: `${SITE()}/account/returns/${r.rmaNumber}`,
      };
    },
  },

  list_my_returns: {
    description: "查這位會員的退換貨申請與進度。",
    needsUser: true,
    schema: z.object({}),
    run: async (_: object, ctx) => {
      const list = await prisma.returnRequest.findMany({
        where: { userId: ctx.userId! },
        orderBy: { createdAt: "desc" },
        take: 8,
        include: { order: { select: { orderNumber: true } }, items: { include: { orderItem: { select: { productName: true } } } } },
      });
      return {
        returns: list.map((r) => ({
          rmaNumber: r.rmaNumber,
          orderNumber: r.order.orderNumber,
          type: RETURN_TYPE_LABEL[r.type],
          status: RETURN_STATUS_LABEL[r.status],
          appliedAt: formatDate(r.createdAt),
          refundAmount: r.refundAmount,
          items: r.items.map((i) => `${i.orderItem.productName} x${i.quantity}`).join("、"),
        })),
      };
    },
  },

  handoff_to_human: {
    description:
      "轉接人工客服。用在：不符合規則但顧客堅持、需要例外處理（瑕疵照片、賠償、改地址）、工具查不到答案、顧客不滿意、或你不確定答案時。",
    schema: z.object({
      reason: z.string().max(200).describe("為什麼要轉人工（給客服看）"),
      summary: z.string().max(500).describe("到目前為止的重點摘要，讓客服不用從頭看"),
    }),
    run: async (i: { reason: string; summary: string }, ctx) => {
      await prisma.conversation.update({
        where: { id: ctx.conversationId },
        data: { status: "WAITING_HUMAN", handoffReason: `${i.reason}\n摘要：${i.summary}`, staffUnread: true },
      });
      return { ok: true, next: `已轉接。請告訴顧客：已轉給真人客服，客服時間 ${STORE.serviceHours}，會在這個對話直接回覆。` };
    },
  },
} satisfies Record<string, ToolDef>;

export type ToolName = keyof typeof TOOLS;

function productBrief(p: { slug: string; name: string; price: number; salePrice: number | null }) {
  return {
    code: p.slug.split("-")[0].toUpperCase(),
    name: p.name,
    price: p.salePrice ?? p.price,
    ...(p.salePrice && { originalPrice: p.price, onSale: true }),
    url: `${SITE()}/products/${p.slug}`,
  };
}

// 轉成 Claude API 要的工具格式（順序固定，提示詞快取才會命中）
export function toolDefinitions(): Anthropic.Tool[] {
  return Object.entries(TOOLS).map(([name, t]) => {
    const schema = z.toJSONSchema(t.schema) as Anthropic.Tool.InputSchema;
    delete (schema as Record<string, unknown>).$schema;
    return { name, description: t.description, input_schema: schema };
  });
}

// 執行 AI 要求的工具：先驗證輸入格式、檢查身分，才真的執行
export async function runTool(name: string, rawInput: unknown, ctx: AgentContext): Promise<{ ok: boolean; result: unknown }> {
  const tool = (TOOLS as Record<string, ToolDef>)[name];
  if (!tool) return { ok: false, result: { error: `沒有 ${name} 這個工具` } };
  if (tool.needsUser && !ctx.userId) {
    return { ok: false, result: { error: "尚未驗證會員身分，不能查詢或處理訂單資料。", howToVerify: verifyHint(ctx.channel) } };
  }
  const parsed = tool.schema.safeParse(rawInput ?? {});
  if (!parsed.success) return { ok: false, result: { error: "參數格式錯誤", detail: parsed.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`) } };
  try {
    return { ok: true, result: await tool.run(parsed.data as never, ctx) };
  } catch (e) {
    console.error(`[agent] tool ${name} failed`, e);
    return { ok: false, result: { error: "系統查詢失敗，請稍後再試或轉人工" } };
  }
}
