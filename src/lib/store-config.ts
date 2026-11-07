// 商店的營運規則集中放在這裡，頁面、結帳流程、之後的客服 BOT 都讀同一份。
import type {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  ReturnReason,
  ReturnStatus,
  ReturnType,
  ShippingMethod,
} from "@/generated/prisma/enums";

export const STORE = {
  name: "NORTHWEAVE 北織",
  shortName: "北織",
  tagline: "日常好穿的基本款",
  serviceEmail: "service@northweave.test",
  servicePhone: "02-2700-0000",
  serviceHours: "週一至週五 10:00–18:00",
};

export const SHIPPING = {
  freeThreshold: 1500, // 滿額免運
  fee: { HOME: 100, CVS: 60 } satisfies Record<ShippingMethod, number>,
  carriers: { HOME: "黑貓宅急便", CVS: "7-ELEVEN 交貨便" } satisfies Record<ShippingMethod, string>,
};

// 台灣消保法：網購享 7 天猶豫期（鑑賞期），從收到商品隔天起算
export const RETURN_WINDOW_DAYS = 7;

export const SIZES = ["XS", "S", "M", "L", "XL"] as const;

export function shippingFeeFor(method: ShippingMethod, subtotalAfterDiscount: number) {
  return subtotalAfterDiscount >= SHIPPING.freeThreshold ? 0 : SHIPPING.fee[method];
}

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "待付款",
  PAID: "已付款",
  PROCESSING: "備貨中",
  SHIPPED: "已出貨",
  DELIVERED: "已送達",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CREDIT_CARD: "信用卡",
  LINE_PAY: "LINE Pay",
  ATM: "ATM 轉帳",
  COD: "貨到付款",
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  UNPAID: "未付款",
  PAID: "已付款",
  REFUNDED: "已退款",
  PARTIALLY_REFUNDED: "部分退款",
};

export const SHIPPING_METHOD_LABEL: Record<ShippingMethod, string> = {
  HOME: "宅配到府",
  CVS: "超商取貨",
};

export const RETURN_TYPE_LABEL: Record<ReturnType, string> = {
  RETURN: "退貨",
  EXCHANGE: "換貨",
};

export const RETURN_STATUS_LABEL: Record<ReturnStatus, string> = {
  REQUESTED: "審核中",
  APPROVED: "已核准，請寄回商品",
  REJECTED: "未通過",
  RECEIVED: "已收到退回商品",
  REFUNDED: "已退款",
  EXCHANGED: "新商品已寄出",
  CANCELLED: "已取消",
};

export const RETURN_REASON_LABEL: Record<ReturnReason, string> = {
  SIZE_TOO_SMALL: "尺寸太小",
  SIZE_TOO_LARGE: "尺寸太大",
  DEFECTIVE: "商品瑕疵",
  WRONG_ITEM: "寄錯商品",
  NOT_AS_DESCRIBED: "與描述不符",
  CHANGED_MIND: "不喜歡 / 改變心意",
};

export function formatPrice(n: number) {
  return `NT$${n.toLocaleString("en-US")}`;
}

export function formatDate(d: Date | string, withTime = false) {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
  });
}

export function garmentImageUrl(garmentType: string, colorHex: string) {
  return `/api/garment/${garmentType}?c=${colorHex.replace("#", "")}`;
}
