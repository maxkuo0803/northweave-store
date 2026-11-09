import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// 可以用 iframe 嵌入本站的網站（作品集）。可用環境變數 FRAME_ANCESTORS（空白分隔）覆蓋
const FRAME_ANCESTORS = (process.env.FRAME_ANCESTORS ?? "https://max-ai-portfolio-tau.vercel.app https://max-ai-portfolio-max-0c94.vercel.app")
  .split(/\s+/)
  .filter(Boolean)
  .concat(process.env.NODE_ENV === "development" ? ["http://localhost:8765"] : []);

// 需要登入才能看的路徑
const PROTECTED = ["/account", "/admin", "/checkout"];

// Proxy 在每個頁面請求進來時先執行，做兩件事：
// 1. 樂觀檢查：沒有登入 cookie 就直接導去登入頁，省一次頁面渲染。
//    真正的權限檢查在每個頁面 / Server Action 裡（requireUser / requireStaff）。
// 2. 加上 Content-Security-Policy（CSP）：告訴瀏覽器「只准執行我們自己的程式」，
//    就算有人想辦法塞進一段惡意 <script>，瀏覽器也會拒絕執行（防 XSS）。
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (PROTECTED.some((p) => pathname === p || pathname.startsWith(p + "/")) && !getSessionCookie(request)) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }

  // 每個請求產生一個隨機 nonce，只有帶著這個 nonce 的 <script> 才能執行。
  // Next.js 會自動把 nonce 加到它自己的 script 上。
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";
  const csp = [
    "default-src 'self'",
    // 開發模式 React 需要 eval 來顯示錯誤堆疊；正式環境不需要
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // 樣式允許 inline：商品顏色色塊用 style 屬性，風險低
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    // 只准自己和作品集網站用 iframe 嵌入（作品集頁面有一個「北織首頁」視窗），其他網站一律不行（防點擊劫持）
    `frame-ancestors 'self' ${FRAME_ANCESTORS.join(" ")}`,
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  // 訪客 ID：隨機字串，用來記住「這個瀏覽器看過哪些商品」和聊天紀錄（不含任何個資）
  if (!request.cookies.get("nw_vid")) {
    response.cookies.set("nw_vid", crypto.randomUUID(), { httpOnly: true, sameSite: "lax", secure: !isDev, maxAge: 60 * 60 * 24 * 180, path: "/" });
  }
  return response;
}

export const config = {
  matcher: [
    {
      // 靜態檔、圖片、API 不需要 CSP
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
