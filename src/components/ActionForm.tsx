"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";

type State = { ok?: string; error?: string } | undefined;

// 通用表單：送出後在下方顯示成功 / 錯誤訊息
export function ActionForm({
  action,
  children,
  submitLabel,
  className = "space-y-4",
  resetOnSuccess = false,
}: {
  action: (state: State, formData: FormData) => Promise<State>;
  children: ReactNode;
  submitLabel: string;
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (resetOnSuccess && state?.ok) ref.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form ref={ref} action={formAction} className={className}>
      {children}
      {state?.error && <p className="rounded-sm bg-bad/10 px-3 py-2 text-sm text-bad">{state.error}</p>}
      {state?.ok && <p className="rounded-sm bg-ok/10 px-3 py-2 text-sm text-ok">{state.ok}</p>}
      <button className="btn-primary" disabled={pending}>{pending ? "處理中…" : submitLabel}</button>
    </form>
  );
}
