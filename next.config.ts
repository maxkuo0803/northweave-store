import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components 先關閉：電商幾乎每頁都跟登入狀態有關，
  // 用傳統的動態渲染比較好理解。之後熟悉了可以再打開優化效能。
  cacheComponents: false,
  // 不要在回應裡透露「這是 Next.js」
  poweredByHeader: false,
  // 所有回應都加上的安全標頭
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // 只准用 HTTPS 連線（2 年）
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          // 不准瀏覽器自己猜檔案類型
          { key: "X-Content-Type-Options", value: "nosniff" },
          // 能不能被別的網站用 iframe 嵌入，改由 CSP 的 frame-ancestors 控制（見 src/proxy.ts）：
          // 只允許自己和作品集網站。X-Frame-Options 沒辦法指定「允許某個網站」，所以拿掉。
          // 連到別的網站時，只透露網域，不透露完整網址
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // 用不到的瀏覽器功能全部關掉
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
