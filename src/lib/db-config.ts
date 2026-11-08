
/**
 * 把 DATABASE_URL 轉成 MariaDB 連線設定。
 * - 本機：mysql://shop:密碼@localhost:3306/clothing_shop
 * - 雲端（TiDB Cloud、Aiven 等）：網址後面加 ?sslaccept=strict，就會用加密連線
 *   例：mysql://xxx.root:密碼@gateway01.ap-northeast-1.prod.aws.tidbcloud.com:4000/clothing_shop?sslaccept=strict
 */
export function dbConfig(url = process.env.DATABASE_URL) {
  if (!url) throw new Error("缺少 DATABASE_URL 環境變數");
  const u = new URL(url);
  const ssl = u.searchParams.get("sslaccept") === "strict" || u.searchParams.get("ssl") === "true";
  return {
    host: u.hostname,
    port: Number(u.port || 3306),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ""),
    // 雲端部署（Vercel）每個函式都會開連線，數量要小，免費方案的資料庫才撐得住
    connectionLimit: Number(process.env.DB_POOL_SIZE ?? 5),
    ...(ssl && { ssl: { rejectUnauthorized: true } }),
  };
}
