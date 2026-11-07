import type { OrderStatus, ReturnStatus } from "@/generated/prisma/enums";
import { ORDER_STATUS_LABEL, RETURN_STATUS_LABEL } from "@/lib/store-config";
import { cn } from "@/lib/utils";

const ORDER_TONE: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "bg-warn/15 text-warn",
  PAID: "bg-brand/10 text-brand",
  PROCESSING: "bg-brand/10 text-brand",
  SHIPPED: "bg-sky-100 text-sky-800",
  DELIVERED: "bg-ok/15 text-ok",
  COMPLETED: "bg-ink/10 text-ink",
  CANCELLED: "bg-bad/10 text-bad",
};

const RETURN_TONE: Record<ReturnStatus, string> = {
  REQUESTED: "bg-warn/15 text-warn",
  APPROVED: "bg-sky-100 text-sky-800",
  REJECTED: "bg-bad/10 text-bad",
  RECEIVED: "bg-brand/10 text-brand",
  REFUNDED: "bg-ok/15 text-ok",
  EXCHANGED: "bg-ok/15 text-ok",
  CANCELLED: "bg-ink/10 text-muted",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <span className={cn("badge", ORDER_TONE[status])}>{ORDER_STATUS_LABEL[status]}</span>;
}

export function ReturnStatusBadge({ status }: { status: ReturnStatus }) {
  return <span className={cn("badge", RETURN_TONE[status])}>{RETURN_STATUS_LABEL[status]}</span>;
}
