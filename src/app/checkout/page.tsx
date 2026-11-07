import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { getCart } from "@/lib/pricing";
import { CheckoutForm } from "./CheckoutForm";

export const metadata: Metadata = { title: "結帳" };

export default async function CheckoutPage() {
  const user = await requireUser("/checkout");
  const lines = await getCart(user.id);
  if (lines.length === 0 || lines.some((l) => !l.available)) redirect("/cart");
  const addresses = await prisma.address.findMany({ where: { userId: user.id }, orderBy: [{ isDefault: "desc" }, { id: "asc" }] });

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-bold">結帳</h1>
      <CheckoutForm
        lines={lines.map((l) => ({ id: l.id, name: l.productName, variant: `${l.color} / ${l.size}`, quantity: l.quantity, lineTotal: l.lineTotal, imageUrl: l.imageUrl }))}
        subtotal={lines.reduce((s, l) => s + l.lineTotal, 0)}
        addresses={addresses.map((a) => ({ id: a.id, label: `${a.recipientName} ${a.phone}`, address: `${a.zipCode} ${a.city}${a.district}${a.line}`, isDefault: a.isDefault }))}
        user={{ name: user.name, phone: user.phone ?? "" }}
      />
    </div>
  );
}
