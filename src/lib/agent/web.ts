import "server-only";
import { cookies } from "next/headers";
import { getSession } from "@/lib/session";

// 網站聊天視窗：辨識「這位訪客是誰」。
// - 有登入：用會員 ID（身分已驗證，AI 可以查他的訂單）
// - 沒登入：用 cookie 裡的隨機訪客 ID（只能問商品和規則）
// 登入前後是兩段不同的對話，避免沒登入時講的話被接到會員帳號底下。

export const VISITOR_COOKIE = "nw_vid";

export async function webIdentity() {
  const session = await getSession();
  const visitorId = (await cookies()).get(VISITOR_COOKIE)?.value ?? null;
  const userId = session?.user.id ?? null;
  return {
    userId,
    visitorId,
    displayName: session?.user.name ?? null,
    externalId: userId ? `user:${userId}` : visitorId ? `v:${visitorId}` : null,
  };
}

// 防跨站請求偽造（CSRF）：只接受從我們自己網站發出的請求
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  return !!origin && !!host && new URL(origin).host === host;
}
