import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { ActionForm } from "@/components/ActionForm";
import { addAddressAction, deleteAddressAction, setDefaultAddressAction } from "../actions";
import { AddressFields } from "@/components/AddressFields";

export const metadata: Metadata = { title: "收件地址" };

export default async function AddressesPage() {
  const user = await requireUser("/account/addresses");
  const addresses = await prisma.address.findMany({ where: { userId: user.id }, orderBy: [{ isDefault: "desc" }, { id: "asc" }] });

  return (
    <div className="space-y-6">
      <h1 className="display text-3xl md:text-4xl">收件地址</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {addresses.map((a) => (
          <div key={a.id} className="card p-5 text-sm">
            <div className="flex items-center gap-2">
              <p className="font-medium">{a.recipientName}</p>
              <p className="text-muted">{a.phone}</p>
              {a.isDefault && <span className="badge bg-brand/10 text-brand">預設</span>}
            </div>
            <p className="mt-2">{a.zipCode} {a.city}{a.district}{a.line}</p>
            <div className="mt-4 flex gap-3">
              {!a.isDefault && (
                <form action={setDefaultAddressAction}>
                  <input type="hidden" name="id" value={a.id} />
                  <button className="text-brand underline">設為預設</button>
                </form>
              )}
              <form action={deleteAddressAction}>
                <input type="hidden" name="id" value={a.id} />
                <button className="text-bad underline">刪除</button>
              </form>
            </div>
          </div>
        ))}
        {addresses.length === 0 && <p className="text-sm text-muted">還沒有儲存地址。</p>}
      </div>
      <div className="card max-w-xl p-6">
        <h2 className="mb-4 font-bold">新增地址</h2>
        <ActionForm action={addAddressAction} submitLabel="新增地址" resetOnSuccess>
          <AddressFields defaultName={user.name} defaultPhone={user.phone ?? ""} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isDefault" /> 設為預設地址
          </label>
        </ActionForm>
      </div>
    </div>
  );
}
