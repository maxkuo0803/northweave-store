import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components 先關閉：電商幾乎每頁都跟登入狀態有關，
  // 用傳統的動態渲染比較好理解。之後熟悉了可以再打開優化效能。
  cacheComponents: false,
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
