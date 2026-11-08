"use client";

import { useActionState } from "react";
import { signInAction, signUpAction } from "./actions";

function FieldError({ msg }: { msg?: string }) {
  return msg ? <p className="mt-1 text-xs text-bad">{msg}</p> : null;
}

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signInAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required className="input" />
      </div>
      <div>
        <label className="label" htmlFor="password">密碼</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
      </div>
      {state?.error && <p className="rounded-sm bg-bad/10 px-3 py-2 text-sm text-bad">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "登入中…" : "登入"}</button>
    </form>
  );
}

export function RegisterForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signUpAction, undefined);
  const fe = state?.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div>
        <label className="label" htmlFor="name">姓名</label>
        <input id="name" name="name" autoComplete="name" required className="input" />
        <FieldError msg={fe.name} />
      </div>
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required className="input" />
        <FieldError msg={fe.email} />
      </div>
      <div>
        <label className="label" htmlFor="phone">手機（選填）</label>
        <input id="phone" name="phone" inputMode="numeric" placeholder="0912345678" className="input" />
        <FieldError msg={fe.phone} />
      </div>
      <div>
        <label className="label" htmlFor="password">密碼（至少 8 碼）</label>
        <input id="password" name="password" type="password" autoComplete="new-password" required className="input" />
        <FieldError msg={fe.password} />
      </div>
      <div>
        <label className="label" htmlFor="confirm">再次輸入密碼</label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" required className="input" />
        <FieldError msg={fe.confirm} />
      </div>
      {state?.error && <p className="rounded-sm bg-bad/10 px-3 py-2 text-sm text-bad">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "建立中…" : "建立帳號"}</button>
    </form>
  );
}
