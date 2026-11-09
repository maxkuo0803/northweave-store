import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { formatPrice } from "@/lib/store-config";

// 「模擬模式」的假模型：沒有 API Key 時用關鍵字決定要呼叫哪個工具，再把結果排成句子。
// 它跟真的 Claude 回傳一樣格式的資料，所以後面的流程（執行工具、記錄步驟、轉人工）完全共用。
// 只能處理簡單問題；正式上線請設定 ANTHROPIC_API_KEY。

export type ModelTurn = Pick<Anthropic.Message, "content" | "stop_reason"> & { usage: { input_tokens: number; output_tokens: number } };

const text = (t: string): ModelTurn => ({ content: [{ type: "text", text: t, citations: null } as Anthropic.TextBlock], stop_reason: "end_turn", usage: { input_tokens: 0, output_tokens: 0 } });
const call = (name: string, input: object): ModelTurn => ({
  content: [{ type: "tool_use", id: `mock_${crypto.randomUUID().slice(0, 8)}`, name, input } as Anthropic.ToolUseBlock],
  stop_reason: "tool_use",
  usage: { input_tokens: 0, output_tokens: 0 },
});

type Product = { code: string; name: string; price: number; onSale?: boolean; url: string };
const list = (ps: Product[]) => ps.map((p) => `・${p.code} ${p.name} ${formatPrice(p.price)}${p.onSale ? "（特價）" : ""}\n  ${p.url}`).join("\n");

export function mockModel(messages: Anthropic.MessageParam[], hasPending: boolean): ModelTurn {
  const last = [...messages].reverse().find((m) => m.role === "user")!;
  // 剛拿到工具結果 → 把結果整理成回覆
  if (Array.isArray(last.content) && last.content[0]?.type === "tool_result") {
    const results = last.content as Anthropic.ToolResultBlockParam[];
    const toolUses = (([...messages].reverse().find((m) => m.role === "assistant")?.content ?? []) as Anthropic.ContentBlockParam[]).filter((b) => b.type === "tool_use") as Anthropic.ToolUseBlockParam[];
    return text(results.map((r, i) => describe(toolUses[i]?.name, JSON.parse(String(r.content)))).join("\n\n"));
  }
  const q = typeof last.content === "string" ? last.content : (last.content.find((b) => b.type === "text") as Anthropic.TextBlockParam | undefined)?.text ?? "";
  const order = q.match(/NW\d{8,}/i)?.[0];
  const product = q.match(/\bNW\d{3}\b/i)?.[0];

  if (hasPending && /(確認|確定|好|沒問題|可以)/.test(q)) return call("confirm_pending_action", {});
  if (/(退換貨進度|退貨進度|換貨進度|RMA)/i.test(q)) return call("list_my_returns", {});
  if (/(退貨|換貨|退換|換尺寸)/.test(q)) return order ? call("check_return_options", { orderNumber: order }) : call("list_my_orders", {});
  if (order) return call("get_order_detail", { orderNumber: order });
  if (/(訂單|物流|到哪|出貨|寄了|包裹)/.test(q)) return call("list_my_orders", {});
  if (product) return call("get_product", { code: product });
  if (/(推薦|搭配|怎麼搭|好搭)/.test(q)) return call("recommend_products", {});
  if (/(運費|免運|付款|鑑賞期|客服時間|電話)/.test(q)) return call("get_store_policies", {});
  if (/(有沒有|想找|想買|找一件|請問有)/.test(q)) {
    const kw = q.match(/(亞麻|棉|牛仔|襯衫|外套|洋裝|裙|褲|帽|包|T恤|針織|連帽)/)?.[0];
    if (kw) return call("search_products", { query: kw });
  }
  if (q.length >= 4) return call("search_knowledge", { query: q });
  return text("你好，我是北織客服小織（模擬模式）！可以問我商品、運費、訂單進度或退換貨喔。");
}

// 把工具結果排成給顧客看的句子
function describe(tool: string | undefined, r: Record<string, unknown>): string {
  if (r.error) return `${r.error}${r.howToVerify ? `\n${r.howToVerify}` : ""}`;
  switch (tool) {
    case "search_products":
    case "recommend_products": {
      const ps = r.products as Product[];
      return ps.length ? `${tool === "recommend_products" ? `推薦給你（${r.reason}）` : "幫你找到這些"}：\n${list(ps)}` : "目前找不到符合的商品，換個關鍵字試試？";
    }
    case "get_product": {
      const colors = (r.colors as { color: string; sizes: string }[]).map((c) => `・${c.color}：${c.sizes}`).join("\n");
      return `${r.code} ${r.name} ${formatPrice(r.price as number)}\n材質：${r.material}\n庫存：\n${colors}\n${r.url}`;
    }
    case "search_knowledge": {
      const f = (r.results as { title: string; content: string }[])[0];
      return f ? `${f.title}\n${f.content}` : "這個問題我不太確定，要幫你轉接真人客服嗎？（回覆「真人」即可）";
    }
    case "get_store_policies": {
      const s = r.shipping as { freeThreshold: number; home: string; cvs: string };
      return `・滿 ${formatPrice(s.freeThreshold)} 免運；${s.home}、${s.cvs}\n・${r.returns}\n・客服時間 ${r.serviceHours}`;
    }
    case "list_my_orders": {
      const os = r.orders as { orderNumber: string; status: string; placedAt: string; total: number }[];
      return os.length ? `你最近的訂單：\n${os.map((o) => `・${o.orderNumber}｜${o.status}｜${o.placedAt}｜${formatPrice(o.total)}`).join("\n")}\n想看哪一張的詳細進度，或要退換貨，請告訴我訂單編號。` : "這個帳號目前沒有訂單。";
    }
    case "get_order_detail":
      return `訂單 ${r.orderNumber}：${r.status}${r.trackingNumber ? `\n物流：${r.carrier} ${r.trackingNumber}` : ""}\n最新進度：${(r.timeline as string[]).at(-1)}\n退換貨：${r.returnable}\n${r.url}`;
    case "check_return_options": {
      if (!r.eligible) return `這張訂單不能申請退換貨：${r.reason}`;
      const items = (r.items as { name: string; bought: string; returnableQuantity: number }[]).map((i) => `・${i.name}（${i.bought}）可退 ${i.returnableQuantity} 件`).join("\n");
      return `可以申請，期限 ${r.deadline}。\n${items}\n模擬模式下請到「會員中心 → 我的訂單」送出申請；接上 AI 後可以直接在對話裡幫你辦。`;
    }
    case "confirm_pending_action":
      return `已送出申請，編號 ${r.rmaNumber}。${r.next}\n${r.url}`;
    case "list_my_returns": {
      const rs = r.returns as { rmaNumber: string; type: string; status: string; items: string }[];
      return rs.length ? rs.map((x) => `・${x.rmaNumber} ${x.type}｜${x.status}｜${x.items}`).join("\n") : "目前沒有退換貨申請。";
    }
    default:
      return String(r.next ?? "好的！");
  }
}
