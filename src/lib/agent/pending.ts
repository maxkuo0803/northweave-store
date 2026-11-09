import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { createReturn, type CreateReturnInput } from "@/lib/returns";
import { getCart, quote } from "@/lib/pricing";
import { addAddress, cancelOrder, cancelReturn, deleteAddress, placeOrder, updateProfile, type AddressInput, type Recipient } from "@/lib/shop";
import type { PaymentMethod, ShippingMethod } from "@/generated/prisma/enums";
import { siteUrl, type AgentContext } from "./tool-kit";

// 「先提案 → 顧客確認 → 才執行」：會花錢、刪資料、改個資的動作都走這裡。
//
// 1. AI 呼叫 propose_xxx：程式先檢查能不能做，把要做的事暫存在對話上（pendingAction）
// 2. AI 把內容告訴顧客，請顧客回覆「確認」
// 3. AI 呼叫 confirm_pending_action：程式檢查「暫存之後顧客真的傳了確認」才執行
//
// 確認由程式判斷，不是 AI 說了算：就算 AI 被騙，也沒辦法在顧客沒同意的情況下下單或取消訂單。

export type PendingAction =
  | { kind: "CREATE_RETURN"; payload: CreateReturnInput }
  | { kind: "PLACE_ORDER"; payload: { shippingMethod: ShippingMethod; paymentMethod: PaymentMethod; recipient: Recipient; couponCode?: string | null; note?: string | null; expectedTotal: number } }
  | { kind: "CANCEL_ORDER"; payload: { orderNumber: string } }
  | { kind: "CANCEL_RETURN"; payload: { rmaNumber: string } }
  | { kind: "ADD_ADDRESS"; payload: { address: AddressInput; makeDefault: boolean } }
  | { kind: "DELETE_ADDRESS"; payload: { addressId: string } }
  | { kind: "UPDATE_PROFILE"; payload: { name?: string; phone?: string | null } };

type Stored = PendingAction & { summary: string; createdAt: string };

const ACTION_LABEL: Record<PendingAction["kind"], string> = {
  CREATE_RETURN: "退換貨申請",
  PLACE_ORDER: "下單",
  CANCEL_ORDER: "取消訂單",
  CANCEL_RETURN: "取消退換貨申請",
  ADD_ADDRESS: "新增收件地址",
  DELETE_ADDRESS: "刪除收件地址",
  UPDATE_PROFILE: "修改個人資料",
};

export async function stagePending(ctx: AgentContext, action: PendingAction, summary: string) {
  const stored: Stored = { ...action, summary, createdAt: new Date().toISOString() };
  await prisma.conversation.update({ where: { id: ctx.conversationId }, data: { pendingAction: stored as unknown as Prisma.InputJsonValue } });
  return {
    ok: true,
    staged: ACTION_LABEL[action.kind],
    summary,
    next: `已暫存「${ACTION_LABEL[action.kind]}」，還沒執行。請把 summary 的內容條列告訴顧客，並請顧客回覆「確認」；顧客確認後再呼叫 confirm_pending_action。`,
  };
}

const YES = /(確認|確定|好|是的|對|沒問題|可以|麻煩|ok|yes|送出|下單|取消吧)/i;
const NO = /(不要|不用了|不好|等等|不對|不是|先不|再想想)/;

export async function confirmPending(ctx: AgentContext) {
  const conv = await prisma.conversation.findUnique({ where: { id: ctx.conversationId }, select: { pendingAction: true } });
  const pending = conv?.pendingAction as Stored | null;
  if (!pending) return { ok: false, error: "沒有等待確認的動作" };
  const clear = () => prisma.conversation.update({ where: { id: ctx.conversationId }, data: { pendingAction: Prisma.DbNull } });

  // 程式檢查：暫存之後，顧客真的有再傳一則「確認」類的訊息
  const after = await prisma.message.findFirst({
    where: { conversationId: ctx.conversationId, role: "CUSTOMER", createdAt: { gt: new Date(pending.createdAt) } },
    orderBy: { createdAt: "desc" },
  });
  if (!after) return { ok: false, error: "顧客還沒回覆，請先等顧客確認" };
  // 「取消訂單」這個動作本身就有「取消」兩個字，所以「取消」不算拒絕；其他否定詞才算
  if (!YES.test(after.content) || NO.test(after.content)) {
    return { ok: false, error: "顧客的回覆不是明確的確認，請再問一次，或詢問要修改哪裡" };
  }
  if (Date.now() - new Date(pending.createdAt).getTime() > 30 * 60_000) {
    await clear();
    return { ok: false, error: "確認已超過 30 分鐘，請重新建立" };
  }
  await clear(); // 先清掉：同一個確認只能執行一次
  const uid = ctx.userId!;
  ctx.effects.refresh = true;

  switch (pending.kind) {
    case "CREATE_RETURN": {
      const r = await createReturn(uid, pending.payload, { note: `由 AI 客服代為申請（${ctx.channel}）` });
      if (!r.ok) return r;
      ctx.effects.links.push({ label: "查看退換貨進度", href: `/account/returns/${r.rmaNumber}` });
      return { ok: true, rmaNumber: r.rmaNumber, next: "申請已送出，等待客服審核（1–2 個工作天）。核准後會通知寄回方式。", url: siteUrl(`/account/returns/${r.rmaNumber}`) };
    }
    case "PLACE_ORDER": {
      // 提案之後購物車可能又被改過：金額跟顧客確認的不一樣就不下單
      const q = await quote(await getCart(uid), pending.payload.shippingMethod, pending.payload.couponCode ?? undefined);
      if (q.total !== pending.payload.expectedTotal) {
        return { ok: false, error: `購物車內容或金額變了（確認時 NT$${pending.payload.expectedTotal.toLocaleString()}，現在 NT$${q.total.toLocaleString()}），請重新整理訂單內容再請顧客確認` };
      }
      const r = await placeOrder(uid, pending.payload);
      if (!r.ok) return r;
      ctx.effects.links.push({ label: "查看訂單", href: `/account/orders/${r.orderNumber}` });
      return { ok: true, orderNumber: r.orderNumber, total: r.total, url: siteUrl(`/account/orders/${r.orderNumber}`), next: "告訴顧客訂單已成立、訂單編號與金額；ATM 付款要提醒 3 天內轉帳（帳號在訂單頁）。" };
    }
    case "CANCEL_ORDER": {
      const r = await cancelOrder(uid, pending.payload.orderNumber);
      // 明確告訴 AI：取消後商品「不會」回到購物車（下單時購物車已清空），避免 AI 自己猜錯
      return r.ok ? { ...r, cart: "下單時購物車已清空，取消訂單後商品不會回到購物車；顧客想重新購買要再加入購物車" } : r;
    }
    case "CANCEL_RETURN":
      return cancelReturn(uid, pending.payload.rmaNumber);
    case "ADD_ADDRESS":
      return addAddress(uid, pending.payload.address, pending.payload.makeDefault);
    case "DELETE_ADDRESS":
      return deleteAddress(uid, pending.payload.addressId);
    case "UPDATE_PROFILE":
      return updateProfile(uid, pending.payload);
  }
}
