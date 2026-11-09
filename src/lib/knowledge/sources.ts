import "server-only";
import { prisma } from "@/lib/prisma";
import { sizeChartFor } from "@/lib/size-chart";
import { PAYMENT_METHOD_LABEL, RETURN_WINDOW_DAYS, SHIPPING, STORE, formatDate } from "@/lib/store-config";
import { GUIDES } from "./guides";

// 把網站上的各種資料整理成「知識片段」：一段標題 + 一段完整、可以單獨看懂的文字。
// 片段寫得越完整（例如商品片段包含分類、性別、材質、價格、顏色、尺寸），語意搜尋越準。

export type SourceType = "PRODUCT" | "FAQ" | "POLICY" | "GUIDE" | "PROMO";
export type ChunkInput = { sourceType: SourceType; sourceId: string; title: string; content: string; url?: string; meta?: Record<string, unknown> };

export const SOURCE_LABEL: Record<SourceType, string> = { PRODUCT: "商品", FAQ: "常見問題", POLICY: "商店規則", GUIDE: "購物指南", PROMO: "優惠活動" };

const GENDER_LABEL = { MEN: "男裝", WOMEN: "女裝", UNISEX: "男女皆可" } as const;
const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "F"];

export async function productChunks(where: { id?: string } = {}): Promise<ChunkInput[]> {
  const products = await prisma.product.findMany({
    where: { status: "ACTIVE", ...where },
    include: { category: { include: { parent: true } }, variants: true, reviews: { select: { rating: true, fit: true } } },
  });
  return products.map((p) => {
    const colors = [...new Set(p.variants.map((v) => v.color))];
    const sizes = [...new Set(p.variants.map((v) => v.size))].sort((a, b) => SIZE_ORDER.indexOf(a) - SIZE_ORDER.indexOf(b));
    const price = p.salePrice ?? p.price;
    const chart = sizeChartFor(p.garmentType, sizes);
    const n = p.reviews.length;
    const avg = n ? (p.reviews.reduce((s, r) => s + r.rating, 0) / n).toFixed(1) : null;
    const code = p.slug.split("-")[0].toUpperCase();
    return {
      sourceType: "PRODUCT",
      sourceId: p.id,
      title: `${code} ${p.name}`,
      content: [
        `${code} ${p.name}，${GENDER_LABEL[p.gender]}・${p.category.parent ? `${p.category.parent.name} / ` : ""}${p.category.name}。`,
        p.description,
        `材質：${p.material}。洗滌：${p.care}。`,
        `價格 NT$${price.toLocaleString()}${p.salePrice ? `（特價，原價 NT$${p.price.toLocaleString()}）` : ""}。`,
        `顏色：${colors.join("、")}。尺寸：${sizes.join("、")}。`,
        chart ? `尺寸表（公分）：${chart.slice(1).map((r) => `${r[0]} ${chart[0].slice(1).map((h, i) => `${h}${r[i + 1]}`).join(" ")}`).join("；")}。` : "",
        avg ? `${n} 則評價，平均 ${avg} 分。` : "",
      ].filter(Boolean).join("\n"),
      url: `/products/${p.slug}`,
      meta: { code, price, onSale: !!p.salePrice, gender: p.gender, garmentType: p.garmentType },
    };
  });
}

async function faqChunks(): Promise<ChunkInput[]> {
  const faqs = await prisma.faq.findMany({ orderBy: { sortOrder: "asc" } });
  return faqs.map((f) => ({ sourceType: "FAQ", sourceId: f.id, title: f.question, content: `【${f.category}】${f.question}\n${f.answer}`, url: "/faq" }));
}

// 商店規則：直接從 store-config 產生，規則改了，重建索引後知識庫就跟著更新
function policyChunks(): ChunkInput[] {
  return [
    {
      sourceType: "POLICY",
      sourceId: "contact",
      title: "客服聯絡方式與時間",
      content: `客服時間 ${STORE.serviceHours}。電話 ${STORE.servicePhone}，Email ${STORE.serviceEmail}。網站右下角、LINE 官方帳號的 AI 客服小織 24 小時回覆；需要真人時可以說「找真人客服」。`,
    },
    {
      sourceType: "POLICY",
      sourceId: "payment",
      title: "付款方式",
      content: `付款方式：${Object.values(PAYMENT_METHOD_LABEL).join("、")}。ATM 轉帳請在下單後 3 天內付款，逾期訂單自動取消。所有訂單開立電子發票。`,
    },
    {
      sourceType: "POLICY",
      sourceId: "shipping",
      title: "運費規則",
      content: `滿 NT$${SHIPPING.freeThreshold.toLocaleString()} 免運。宅配 ${SHIPPING.carriers.HOME} NT$${SHIPPING.fee.HOME}，超商取貨 ${SHIPPING.carriers.CVS} NT$${SHIPPING.fee.CVS}。`,
    },
    {
      sourceType: "POLICY",
      sourceId: "returns",
      title: "鑑賞期與退換貨規定",
      content: `收到商品隔天起 ${RETURN_WINDOW_DAYS} 天內可以退貨或換尺寸、顏色。商品需全新、吊牌未剪、未下水。`,
    },
  ];
}

// 優惠碼：只收「現在有效」的；搜尋時也會再檢查一次到期日（索引之後才過期的不會被推薦）
async function promoChunks(): Promise<ChunkInput[]> {
  const now = new Date();
  const coupons = await prisma.coupon.findMany({ where: { isActive: true, startsAt: { lte: now }, endsAt: { gt: now } } });
  return coupons.map((c) => ({
    sourceType: "PROMO",
    sourceId: c.id,
    title: `優惠碼 ${c.code}`,
    content: `優惠碼 ${c.code}：${c.description}。${c.minSpend ? `消費滿 NT$${c.minSpend.toLocaleString()} 可用。` : ""}有效期限到 ${formatDate(c.endsAt)}。結帳時輸入優惠碼即可折抵。`,
    meta: { endsAt: c.endsAt.toISOString() },
  }));
}

function guideChunks(): ChunkInput[] {
  return GUIDES.map((g) => ({ sourceType: "GUIDE", sourceId: g.id, title: g.title, content: g.content }));
}

export async function allChunks(): Promise<ChunkInput[]> {
  return [...(await productChunks()), ...(await faqChunks()), ...policyChunks(), ...(await promoChunks()), ...guideChunks()];
}
