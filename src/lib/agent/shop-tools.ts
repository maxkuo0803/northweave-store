import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCart, quote, validateCoupon } from "@/lib/pricing";
import { CANCELLABLE } from "@/lib/orders";
import { addToCart, setCartQuantity, setDefaultAddress, setWishlist } from "@/lib/shop";
import { PAYMENT_METHOD_LABEL, SHIPPING, SHIPPING_METHOD_LABEL, formatPrice } from "@/lib/store-config";
import type { PaymentMethod, ShippingMethod } from "@/generated/prisma/enums";
import { maskName, maskPhone } from "./guard";
import { stagePending } from "./pending";
import { productBrief, productImageSelect, siteUrl, type AgentContext, type ToolDef } from "./tool-kit";

// 小織能幫顧客「動手做」的事：跟顧客自己在網站上點按鈕能做的一樣。
// 全部呼叫 lib/shop.ts（網站表單用的同一套函式），所以庫存、金額、權限檢查都一樣。
//
// 分兩類：
// - 直接做：看購物車、加入 / 修改購物車、收藏、檢查優惠碼、看地址、設預設地址、開啟頁面（隨時可以再改回來）
// - 要顧客確認：下單、取消訂單、取消退換貨、新增 / 刪除地址、修改個人資料（propose_xxx → confirm_pending_action）
//
// 不開放：改密碼、改 Email、刪帳號、輸入信用卡號（AI 不該碰這些）。

const code = z.string().max(60).describe("商品編號，例如 NW012");

async function findProduct(c: string) {
  const slug = c.trim().toLowerCase().replace(/^.*\/products\//, "");
  return prisma.product.findFirst({
    where: { status: "ACTIVE", OR: [{ slug }, { slug: { startsWith: slug + "-" } }] },
    include: { variants: true, images: productImageSelect },
  });
}

async function cartSummary(userId: string) {
  const lines = await getCart(userId);
  const q = await quote(lines, "HOME");
  return {
    items: lines.map((l) => ({
      cartItemId: l.id,
      code: l.slug.split("-")[0].toUpperCase(),
      name: l.productName,
      color: l.color,
      size: l.size,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      lineTotal: l.lineTotal,
      ...(!l.available && { problem: l.stock === 0 ? "已售完" : `庫存只剩 ${l.stock} 件` }),
    })),
    subtotal: q.subtotal,
    freeShippingGap: q.subtotal >= SHIPPING.freeThreshold ? 0 : SHIPPING.freeThreshold - q.subtotal,
  };
}

// 地址的固定順序：預設地址第一，其餘照 id 排。list_addresses 和 propose_order 都用這個，「地址 N」才會對得上
const savedAddresses = (userId: string) => prisma.address.findMany({ where: { userId }, orderBy: [{ isDefault: "desc" }, { id: "asc" }] });

const OPEN_PAGES = {
  cart: { label: "前往購物車", href: "/cart" },
  checkout: { label: "前往結帳", href: "/checkout" },
  orders: { label: "我的訂單", href: "/account/orders" },
  returns: { label: "我的退換貨", href: "/account/returns" },
  wishlist: { label: "我的收藏", href: "/account/wishlist" },
  addresses: { label: "收件地址", href: "/account/addresses" },
  profile: { label: "個人資料", href: "/account/profile" },
  faq: { label: "常見問題", href: "/faq" },
  login: { label: "登入", href: "/login" },
} as const;

export const SHOP_TOOLS = {
  view_cart: {
    description: "查看顧客的購物車：每件商品（含 cartItemId）、數量、小計、還差多少免運。",
    needsUser: true,
    schema: z.object({}),
    run: async (_: object, ctx: AgentContext) => cartSummary(ctx.userId!),
  },

  add_to_cart: {
    description:
      "把商品加入顧客的購物車。一定要知道顏色和尺寸（配件是 F），不確定就先用 get_product 查有哪些顏色尺寸、問顧客。加入後不用再確認。",
    needsUser: true,
    schema: z.object({
      code,
      color: z.string().max(20).optional().describe("顏色名稱，例如「墨黑」"),
      size: z.string().max(10).optional().describe("尺寸，例如 M、30、F"),
      quantity: z.number().int().min(1).max(10).default(1),
    }),
    run: async (i: { code: string; color?: string; size?: string; quantity: number }, ctx: AgentContext) => {
      const p = await findProduct(i.code);
      if (!p) return { ok: false, error: "找不到這個商品" };
      const matches = p.variants.filter((v) => (!i.color || v.color === i.color.trim()) && (!i.size || v.size.toUpperCase() === i.size.trim().toUpperCase()));
      if (matches.length !== 1) {
        // 不知道顏色尺寸：直接在聊天視窗放選擇器讓顧客點，不要用文字列一長串選項
        ctx.effects.products.set(productBrief(p).code, productBrief(p));
        ctx.effects.pickers.add(productBrief(p).code);
        return {
          ok: false,
          error: matches.length === 0 ? "沒有這個顏色 / 尺寸" : "還不知道顏色和尺寸",
          next: ctx.channel === "WEB" ? "聊天視窗已顯示顏色尺寸選擇器，只要回一句「請選顏色和尺寸」即可，不要列出選項。" : "請簡短詢問顏色和尺寸。",
          ...(ctx.channel !== "WEB" && { options: p.variants.filter((v) => v.stock > 0).map((v) => `${v.color} / ${v.size}`) }),
        };
      }
      const r = await addToCart(ctx.userId!, matches[0].id, i.quantity);
      if (!r.ok) return r;
      ctx.effects.refresh = true;
      ctx.effects.products.set(productBrief(p).code, productBrief(p));
      ctx.effects.links.push({ label: "前往購物車", href: "/cart" });
      return { ...r, cart: await cartSummary(ctx.userId!) };
    },
  },

  update_cart_item: {
    description: "修改購物車裡某件商品的數量；quantity 填 0 就是移除。cartItemId 從 view_cart 取得。",
    needsUser: true,
    schema: z.object({ cartItemId: z.string().max(40), quantity: z.number().int().min(0).max(10) }),
    run: async (i: { cartItemId: string; quantity: number }, ctx: AgentContext) => {
      const r = await setCartQuantity(ctx.userId!, i.cartItemId, i.quantity);
      if (r.ok) ctx.effects.refresh = true;
      return { ...r, cart: await cartSummary(ctx.userId!) };
    },
  },

  show_variant_picker: {
    description:
      "在網站聊天視窗顯示商品的「顏色 / 尺寸選擇器」（色塊 + 尺寸按鈕 + 加入購物車），顧客點選就直接加入購物車。顧客想買、想加入購物車、問有什麼顏色尺寸時使用，取代用文字列出顏色尺寸。最多 4 件。",
    schema: z.object({ codes: z.array(code).min(1).max(4) }),
    run: async (i: { codes: string[] }, ctx: AgentContext) => {
      const found: string[] = [];
      for (const c of i.codes) {
        const p = await findProduct(c);
        if (!p) continue;
        const b = productBrief(p);
        ctx.effects.products.set(b.code, b);
        ctx.effects.pickers.add(b.code);
        found.push(`${b.code} ${b.name}`);
      }
      if (!found.length) return { ok: false, error: "找不到這些商品" };
      if (ctx.channel !== "WEB") return { ok: false, error: "這個平台不支援選擇器，請簡短詢問顏色和尺寸" };
      return { ok: true, shown: found, next: "選擇器已顯示。回覆一句「請選顏色和尺寸」就好，不要列出選項。" };
    },
  },

  offer_choices: {
    description:
      "在聊天視窗顯示選項按鈕（LINE 會變成快速回覆按鈕），顧客按下去就等於傳出那句話。要顧客做選擇時一定用這個，不要在文字裡列選項。例如付款方式、宅配或超商、選哪個地址、要不要一起結帳。",
    schema: z.object({
      options: z
        .array(z.object({ label: z.string().max(20).describe("按鈕上的字，越短越好"), reply: z.string().max(60).describe("按下後代替顧客傳出的話") }))
        .min(2)
        .max(6),
    }),
    run: async (i: { options: { label: string; reply: string }[] }, ctx: AgentContext) => {
      ctx.effects.choices = i.options;
      return { ok: true, next: "按鈕已顯示。文字只要一句問題，不要再列出選項。" };
    },
  },

  view_wishlist: {
    description: "查看顧客收藏的商品。",
    needsUser: true,
    schema: z.object({}),
    run: async (_: object, ctx: AgentContext) => {
      const items = await prisma.wishlistItem.findMany({
        where: { userId: ctx.userId! },
        orderBy: { createdAt: "desc" },
        take: 12,
        include: { product: { include: { images: productImageSelect, variants: { select: { stock: true } } } } },
      });
      return { items: items.map((w) => ({ ...productBrief(w.product), soldOut: w.product.variants.every((v) => v.stock === 0) })) };
    },
  },

  set_wishlist: {
    description: "把商品加入收藏（wanted=true）或取消收藏（wanted=false）。",
    needsUser: true,
    schema: z.object({ code, wanted: z.boolean() }),
    run: async (i: { code: string; wanted: boolean }, ctx: AgentContext) => {
      const p = await findProduct(i.code);
      if (!p) return { ok: false, error: "找不到這個商品" };
      const r = await setWishlist(ctx.userId!, p.id, i.wanted);
      if (r.ok) ctx.effects.refresh = true;
      return r;
    },
  },

  check_coupon: {
    description: "檢查優惠碼能不能用在顧客目前的購物車，以及可以折多少。",
    needsUser: true,
    schema: z.object({ couponCode: z.string().max(40) }),
    run: async (i: { couponCode: string }, ctx: AgentContext) => {
      const lines = await getCart(ctx.userId!);
      const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
      const r = await validateCoupon(i.couponCode, subtotal);
      return r.error ? { ok: false, error: r.error, subtotal } : { ok: true, code: r.coupon!.code, description: r.coupon!.description, discount: r.discount, subtotal };
    },
  },

  list_addresses: {
    description:
      "列出顧客儲存的收件地址（地址 1、地址 2…，預設地址排第一），並自動在聊天視窗放上選地址的按鈕。顧客回「寄到地址 N」時，propose_order 用 addressNo=N。",
    needsUser: true,
    schema: z.object({}),
    run: async (_: object, ctx: AgentContext) => {
      const list = await savedAddresses(ctx.userId!);
      if (list.length) {
        // 按鈕：按下去等於傳出「寄到地址 N（地區）」，下一輪 AI 用編號就能找到地址
        ctx.effects.choices = list.map((a, i) => ({ label: `${a.city}${a.district}${a.isDefault ? "（預設）" : ""}`, reply: `寄到地址 ${i + 1}（${a.city}${a.district}）` }));
      }
      return {
        addresses: list.map((a, i) => ({
          addressNo: i + 1,
          addressId: a.id,
          isDefault: a.isDefault,
          // 地址本來就是顧客自己的，但還是部分遮罩：讓顧客認得出是哪一筆就好
          recipient: `${maskName(a.recipientName)} ${maskPhone(a.phone)}`,
          address: `${a.city}${a.district}${a.line.slice(0, 4)}…`,
        })),
        next: list.length ? "選地址的按鈕已顯示，文字只要一句「請選收件地址」。" : "沒有儲存的地址：請顧客到會員中心新增（open_page addresses），或改用超商取貨。",
      };
    },
  },

  set_default_address: {
    description: "把某筆地址設為預設收件地址。",
    needsUser: true,
    schema: z.object({ addressId: z.string().max(40) }),
    run: async (i: { addressId: string }, ctx: AgentContext) => setDefaultAddress(ctx.userId!, i.addressId),
  },

  open_page: {
    description: "在顧客的聊天視窗放一個按鈕，帶顧客到網站某一頁（購物車、結帳、訂單、收藏、地址、個人資料、某件商品）。顧客說「帶我去結帳」「我要看購物車」時使用。",
    schema: z.object({
      page: z.enum(["cart", "checkout", "orders", "returns", "wishlist", "addresses", "profile", "faq", "login", "product"]),
      productCode: z.string().max(60).optional().describe("page=product 時填商品編號"),
    }),
    run: async (i: { page: keyof typeof OPEN_PAGES | "product"; productCode?: string }, ctx: AgentContext) => {
      let link: { label: string; href: string };
      if (i.page === "product") {
        const p = i.productCode ? await findProduct(i.productCode) : null;
        if (!p) return { ok: false, error: "找不到這個商品" };
        link = { label: `查看 ${p.name}`, href: `/products/${p.slug}` };
        ctx.effects.products.set(productBrief(p).code, productBrief(p));
      } else link = OPEN_PAGES[i.page];
      ctx.effects.links.push(link);
      return { ok: true, url: siteUrl(link.href), next: ctx.channel === "WEB" ? "聊天視窗已出現按鈕，請顧客點擊。" : "請把網址給顧客。" };
    },
  },

  // ── 以下要顧客確認 ──
  propose_order: {
    description:
      "幫顧客用「目前購物車的內容」下單（還不會送出）。宅配用顧客選的地址編號（addressNo，來自 list_addresses）；超商取貨要門市名稱、取件人姓名與手機。付款方式：CREDIT_CARD / LINE_PAY（作品集為模擬付款，送出即視為付款成功，絕對不要向顧客要卡號）、ATM、COD（貨到付款）。",
    needsUser: true,
    schema: z.object({
      shippingMethod: z.enum(["HOME", "CVS"]),
      paymentMethod: z.enum(["CREDIT_CARD", "LINE_PAY", "ATM", "COD"]),
      addressId: z.string().max(40).optional(),
      addressNo: z.number().int().min(1).max(10).optional().describe("顧客選的「地址 N」的 N（list_addresses 的 addressNo）"),
      cvsStore: z.string().max(40).optional().describe("超商門市名稱，例如「市府門市」"),
      cvsName: z.string().max(40).optional(),
      cvsPhone: z.string().max(10).optional(),
      couponCode: z.string().max(40).optional(),
      note: z.string().max(200).optional(),
    }),
    run: async (
      i: { shippingMethod: ShippingMethod; paymentMethod: PaymentMethod; addressId?: string; addressNo?: number; cvsStore?: string; cvsName?: string; cvsPhone?: string; couponCode?: string; note?: string },
      ctx: AgentContext,
    ) => {
      const uid = ctx.userId!;
      let recipient: { name: string; phone: string; address: string };
      if (i.shippingMethod === "CVS") {
        if (!i.cvsStore || !i.cvsName || !i.cvsPhone) return { ok: false, error: "超商取貨需要門市名稱、取件人姓名和手機" };
        if (!/^09\d{8}$/.test(i.cvsPhone)) return { ok: false, error: "取件人手機格式為 09 開頭共 10 碼" };
        recipient = { name: i.cvsName.trim(), phone: i.cvsPhone, address: `7-ELEVEN ${i.cvsStore.trim()}` };
      } else {
        const list = await savedAddresses(uid);
        const a = i.addressNo ? list[i.addressNo - 1] : i.addressId ? list.find((x) => x.id === i.addressId) : list.find((x) => x.isDefault) ?? list[0];
        if (!a) return { ok: false, error: "沒有收件地址，請先用 list_addresses 確認，或請顧客提供地址（propose_add_address）" };
        recipient = { name: a.recipientName, phone: a.phone, address: `${a.zipCode} ${a.city}${a.district}${a.line}` };
      }
      const lines = await getCart(uid);
      if (!lines.length) return { ok: false, error: "購物車是空的，請先加入商品" };
      const bad = lines.find((l) => !l.available);
      if (bad) return { ok: false, error: `${bad.productName}（${bad.color} / ${bad.size}）庫存不足，請先調整購物車` };
      const q = await quote(lines, i.shippingMethod, i.couponCode);
      if (i.couponCode && q.couponError) return { ok: false, error: `優惠碼無法使用：${q.couponError}` };

      const summary = [
        ...lines.map((l) => `・${l.productName}（${l.color} / ${l.size}）× ${l.quantity}　${formatPrice(l.lineTotal)}`),
        `小計 ${formatPrice(q.subtotal)}${q.discount ? `，優惠 ${q.couponCode} 折 ${formatPrice(q.discount)}` : ""}，運費 ${formatPrice(q.shippingFee)}`,
        `總金額 ${formatPrice(q.total)}`,
        `配送：${SHIPPING_METHOD_LABEL[i.shippingMethod]}，收件人 ${maskName(recipient.name)} ${maskPhone(recipient.phone)}，${i.shippingMethod === "CVS" ? recipient.address : `${recipient.address.slice(0, 9)}…`}`,
        `付款：${PAYMENT_METHOD_LABEL[i.paymentMethod]}${i.paymentMethod === "CREDIT_CARD" || i.paymentMethod === "LINE_PAY" ? "（模擬付款）" : ""}`,
      ].join("\n");
      return stagePending(
        ctx,
        { kind: "PLACE_ORDER", payload: { shippingMethod: i.shippingMethod, paymentMethod: i.paymentMethod, recipient, couponCode: i.couponCode ?? null, note: i.note ?? null, expectedTotal: q.total } },
        summary,
      );
    },
  },

  propose_cancel_order: {
    description: "幫顧客取消訂單（還不會執行）。只有「待付款」「已付款」的訂單能取消，已備貨或出貨的請引導退貨。",
    needsUser: true,
    schema: z.object({ orderNumber: z.string().max(30) }),
    run: async (i: { orderNumber: string }, ctx: AgentContext) => {
      const orderNumber = i.orderNumber.trim().toUpperCase();
      const o = await prisma.order.findFirst({ where: { orderNumber, userId: ctx.userId! }, include: { items: true } });
      if (!o) return { ok: false, error: "這個帳號底下找不到這張訂單" };
      if (!CANCELLABLE.includes(o.status)) return { ok: false, error: "訂單已進入備貨或出貨，不能取消；收到商品後可以申請退貨" };
      return stagePending(
        ctx,
        { kind: "CANCEL_ORDER", payload: { orderNumber } },
        `取消訂單 ${orderNumber}（${o.items.map((it) => `${it.productName} × ${it.quantity}`).join("、")}，${formatPrice(o.total)}）${o.paymentStatus === "PAID" ? "\n已付款的金額會在 3–5 個工作天退回" : ""}`,
      );
    },
  },

  propose_cancel_return: {
    description: "幫顧客取消一筆「審核中」的退換貨申請（還不會執行）。",
    needsUser: true,
    schema: z.object({ rmaNumber: z.string().max(30) }),
    run: async (i: { rmaNumber: string }, ctx: AgentContext) => {
      const rmaNumber = i.rmaNumber.trim().toUpperCase();
      const r = await prisma.returnRequest.findFirst({ where: { rmaNumber, userId: ctx.userId! } });
      if (!r) return { ok: false, error: "找不到這筆申請" };
      if (r.status !== "REQUESTED") return { ok: false, error: "這筆申請已經審核過，不能取消；需要協助請轉真人客服" };
      return stagePending(ctx, { kind: "CANCEL_RETURN", payload: { rmaNumber } }, `取消退換貨申請 ${rmaNumber}`);
    },
  },

  propose_add_address: {
    description: "幫顧客新增收件地址（還不會執行）。地址是顧客自己提供的個資，只在顧客主動提供時使用，不要追問多餘資料。",
    needsUser: true,
    schema: z.object({
      recipientName: z.string().trim().min(1).max(40),
      phone: z.string().regex(/^09\d{8}$/, "手機格式為 09 開頭共 10 碼"),
      zipCode: z.string().regex(/^\d{3}(\d{2,3})?$/, "郵遞區號 3 或 5～6 碼"),
      city: z.string().min(1).max(10),
      district: z.string().min(1).max(20),
      line: z.string().min(3).max(120),
      makeDefault: z.boolean().default(false),
    }),
    run: async (i: { recipientName: string; phone: string; zipCode: string; city: string; district: string; line: string; makeDefault: boolean }, ctx: AgentContext) => {
      const { makeDefault, ...address } = i;
      return stagePending(
        ctx,
        { kind: "ADD_ADDRESS", payload: { address, makeDefault } },
        `新增收件地址：${address.recipientName} ${address.phone}，${address.zipCode} ${address.city}${address.district}${address.line}${makeDefault ? "（設為預設）" : ""}`,
      );
    },
  },

  propose_delete_address: {
    description: "幫顧客刪除一筆收件地址（還不會執行）。addressId 從 list_addresses 取得。",
    needsUser: true,
    schema: z.object({ addressId: z.string().max(40) }),
    run: async (i: { addressId: string }, ctx: AgentContext) => {
      const a = await prisma.address.findFirst({ where: { id: i.addressId, userId: ctx.userId! } });
      if (!a) return { ok: false, error: "找不到這筆地址" };
      return stagePending(ctx, { kind: "DELETE_ADDRESS", payload: { addressId: a.id } }, `刪除地址：${maskName(a.recipientName)}，${a.city}${a.district}…`);
    },
  },

  propose_update_profile: {
    description: "幫顧客修改個人資料的姓名或手機（還不會執行）。密碼、Email 不能由客服修改，請引導到「會員中心 → 個人資料」自行操作。",
    needsUser: true,
    schema: z.object({
      name: z.string().trim().min(1).max(40).optional(),
      phone: z.string().regex(/^09\d{8}$/, "手機格式為 09 開頭共 10 碼").optional(),
    }),
    run: async (i: { name?: string; phone?: string }, ctx: AgentContext) => {
      if (!i.name && !i.phone) return { ok: false, error: "沒有要修改的內容" };
      return stagePending(ctx, { kind: "UPDATE_PROFILE", payload: i }, `修改個人資料：${[i.name && `姓名改為 ${i.name}`, i.phone && `手機改為 ${i.phone}`].filter(Boolean).join("，")}`);
    },
  },
} satisfies Record<string, ToolDef>;
