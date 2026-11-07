import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { ReturnStatusBadge } from "@/components/StatusBadge";
import { RETURN_REASON_LABEL, RETURN_TYPE_LABEL, STORE, formatDate, formatPrice } from "@/lib/store-config";
import { cn } from "@/lib/utils";
import type { ReturnStatus } from "@/generated/prisma/enums";
import { cancelReturnAction } from "../../orders/actions";

export const metadata: Metadata = { title: "退換貨詳情" };

export default async function ReturnDetailPage({ params, searchParams }: PageProps<"/account/returns/[rmaNumber]">) {
  const { rmaNumber } = await params;
  const { created } = await searchParams;
  const user = await requireUser(`/account/returns/${rmaNumber}`);
  const r = await prisma.returnRequest.findFirst({
    where: { rmaNumber, userId: user.id },
    include: { order: true, items: { include: { orderItem: true, exchangeVariant: true } } },
  });
  if (!r) notFound();

  const finalStep: ReturnStatus = r.type === "RETURN" ? "REFUNDED" : "EXCHANGED";
  const steps: { status: ReturnStatus; label: string }[] = [
    { status: "REQUESTED", label: "已申請" },
    { status: "APPROVED", label: "審核通過" },
    { status: "RECEIVED", label: "收到退回商品" },
    { status: finalStep, label: r.type === "RETURN" ? "完成退款" : "新商品寄出" },
  ];
  const reached = steps.findIndex((s) => s.status === r.status);
  const ended = r.status === "REJECTED" || r.status === "CANCELLED";

  return (
    <div className="space-y-6">
      {created && <div className="rounded-2xl bg-ok/10 p-5 text-sm text-ok">已收到您的申請，我們會在 1–2 個工作天內審核，結果會通知您。</div>}
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/account/returns" className="text-sm text-muted">← 退換貨紀錄</Link>
        <h1 className="text-2xl font-bold">{r.rmaNumber}</h1>
        <span className="badge bg-sand">{RETURN_TYPE_LABEL[r.type]}</span>
        <ReturnStatusBadge status={r.status} />
      </div>

      {!ended && (
        <ol className="grid grid-cols-4 gap-2 text-center text-xs">
          {steps.map((s, i) => (
            <li key={s.status}>
              <div className={cn("mx-auto h-2 rounded-full", i <= reached ? "bg-brand" : "bg-line")} />
              <p className={cn("mt-2", i <= reached ? "font-medium" : "text-muted")}>{s.label}</p>
            </li>
          ))}
        </ol>
      )}

      {r.status === "APPROVED" && (
        <div className="card border-brand/40 p-5 text-sm">
          <p className="font-bold">請在 7 天內寄回商品</p>
          <p className="mt-2">到任一 7-ELEVEN 使用「交貨便」寄件，代碼 <span className="font-mono font-bold">{r.rmaNumber.slice(-8)}</span>，運費由我們支付。</p>
          <p className="mt-1 text-muted">請將商品連同吊牌、包裝一起寄回，並在包裹上註明退換貨編號。</p>
        </div>
      )}
      {r.status === "REJECTED" && <div className="card border-bad/40 p-5 text-sm"><p className="font-bold text-bad">申請未通過</p><p className="mt-1">{r.adminNote ?? "不符合退換貨條件"}</p><p className="mt-1 text-muted">如有疑問請聯絡客服 {STORE.servicePhone}</p></div>}

      <div className="card space-y-2 p-5 text-sm">
        <p><span className="text-muted">訂單：</span><Link href={`/account/orders/${r.order.orderNumber}`} className="text-brand underline">{r.order.orderNumber}</Link></p>
        <p><span className="text-muted">申請時間：</span>{formatDate(r.createdAt, true)}</p>
        <p><span className="text-muted">原因：</span>{RETURN_REASON_LABEL[r.reason]}{r.description && `（${r.description}）`}</p>
        {r.refundAmount && <p><span className="text-muted">退款金額：</span>{formatPrice(r.refundAmount)}</p>}
        <ul className="mt-3 divide-y divide-line border-t border-line">
          {r.items.map((i) => (
            <li key={i.id} className="flex items-center gap-3 py-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={i.orderItem.imageUrl} alt="" className="h-14 w-14 rounded-lg bg-sand" />
              <div>
                <p className="font-medium">{i.orderItem.productName} × {i.quantity}</p>
                <p className="text-muted">{i.orderItem.color} / {i.orderItem.size}{i.exchangeVariant && ` → 換成 ${i.exchangeVariant.color} / ${i.exchangeVariant.size}`}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {r.status === "REQUESTED" && (
        <form action={cancelReturnAction}>
          <input type="hidden" name="rmaNumber" value={r.rmaNumber} />
          <button className="btn-danger">取消申請</button>
        </form>
      )}
    </div>
  );
}
