// Prisma CLI 設定檔。Prisma 7 不會自動讀 .env，所以這裡手動載入 .env.local
import { config } from "dotenv";
import { defineConfig } from "prisma/config";

config({ path: ".env.local" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // `prisma generate`（npm install 時自動跑）只是產生程式碼，不需要連資料庫。
    // Vercel 的 Preview 部署沒有 DATABASE_URL，用 env() 會直接報錯讓整個部署失敗，
    // 所以沒有設定時給一個假的網址；migrate / seed 這類真的要連線的指令，沒設定一樣會連不上而報錯。
    url: process.env.DATABASE_URL ?? "mysql://unset:unset@localhost:3306/unset",
  },
});
