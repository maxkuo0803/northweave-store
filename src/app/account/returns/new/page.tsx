import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { getOrderForUser, returnEligibility, returnableQuantities } from "@/lib/orders";
import { formatDate } from "@/lib/store-config";
import { ReturnForm } from "./ReturnForm";

export const metadata: Metadata = { title: "申請退換貨" };

export default async function NewReturnPage({ searchParams }: PageProps<"/account/returns/new">) {
  const { order: orderNumber } = await searchParams;
  if (typeof orderNumber !== "string") notFound();
  const user = await requireUser(`/account/returns/new?order=${orderNumber}`);
  const order = await getOrderForUser(orderNumber, user.id);
  if (!order) notFound();

  const eligible = returnEligibility(order);
  if (!eligible.ok) {
    return (
      <div className="card p-8 text-center">
        <p className="font-bold">這筆訂單無法申請退換貨</p>
        <p className="mt-2 text-sm text-muted">{eligible.reason}</p>
        <Link href={`/account/orders/${orderNumber}`} className="btn-outline mt-6">回訂單</Link>
      </div>
    );
  }

  const remaining = returnableQuantities(order);
  // 換貨選項：同一件商品、其他顏色或尺寸、目前有庫存
  const productIds = [...new Set(order.items.map((i) => i.variant?.productId).filter(Boolean))] as string[];
  const variants = await prisma.productVariant.findMany({ where: { productId: { in: productIds }, stock: { gt: 0 } }, orderBy: { sku: "asc" } });

  return (
    <div>
      <Link href={`/account/orders/${orderNumber}`} className="text-sm text-muted">← 訂單 {orderNumber}</Link>
      <h1 className="display mt-2 text-3xl md:text-4xl">申請退換貨</h1>
      <p className="mt-1 text-sm text-muted">鑑賞期至 {formatDate(eligible.deadline)}。商品需保持全新、吊牌未剪、未下水洗滌。</p>
      <ReturnForm
        orderNumber={orderNumber}
        items={order.items
          .filter((it) => remaining[it.id] > 0)
          .map((it) => ({
            id: it.id,
            name: it.productName,
            variant: `${it.color} / ${it.size}`,
            imageUrl: it.imageUrl,
            max: remaining[it.id],
            options: variants
              .filter((v) => v.productId === it.variant?.productId && v.id !== it.variantId)
              .map((v) => ({ id: v.id, label: `${v.color} / ${v.size}` })),
          }))}
      />
    </div>
  );
}
