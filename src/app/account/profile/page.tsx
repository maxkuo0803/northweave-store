import type { Metadata } from "next";
import { requireUser } from "@/lib/session";
import { ActionForm } from "@/components/ActionForm";
import { changePasswordAction, updateProfileAction } from "../actions";

export const metadata: Metadata = { title: "個人資料" };

export default async function ProfilePage() {
  const user = await requireUser("/account/profile");
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">個人資料</h1>
      <div className="card max-w-lg p-6">
        <ActionForm action={updateProfileAction} submitLabel="儲存">
          <div>
            <label className="label">Email（登入帳號，無法修改）</label>
            <input value={user.email} disabled className="input bg-sand" />
          </div>
          <div>
            <label className="label" htmlFor="name">姓名</label>
            <input id="name" name="name" defaultValue={user.name} className="input" required />
          </div>
          <div>
            <label className="label" htmlFor="phone">手機</label>
            <input id="phone" name="phone" defaultValue={user.phone ?? ""} className="input" inputMode="numeric" />
          </div>
        </ActionForm>
      </div>
      <div className="card max-w-lg p-6">
        <h2 className="mb-4 font-bold">變更密碼</h2>
        <ActionForm action={changePasswordAction} submitLabel="更新密碼" resetOnSuccess>
          <div>
            <label className="label" htmlFor="currentPassword">目前密碼</label>
            <input id="currentPassword" name="currentPassword" type="password" className="input" required autoComplete="current-password" />
          </div>
          <div>
            <label className="label" htmlFor="newPassword">新密碼</label>
            <input id="newPassword" name="newPassword" type="password" className="input" required autoComplete="new-password" />
          </div>
          <div>
            <label className="label" htmlFor="confirm">再次輸入新密碼</label>
            <input id="confirm" name="confirm" type="password" className="input" required autoComplete="new-password" />
          </div>
        </ActionForm>
      </div>
    </div>
  );
}
