import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@/generated/prisma/client";
import { dbConfig } from "./db-config";

// 開發模式下 Next.js 熱重載會一直重新執行模組，
// 把 client 存在 globalThis 上，避免每次都開一個新的連線池把 MySQL 連線用光。
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  const adapter = new PrismaMariaDb(dbConfig());
  return new PrismaClient({ adapter });
}

// 「用到才連線」：第一次真的查資料庫時才建立 client。
// 這樣 `next build` 只是載入程式檔（例如 Vercel Preview 沒設定 DATABASE_URL）時不會直接失敗，
// 要等到真的查詢時，才會出現「缺少 DATABASE_URL」的錯誤。
function client() {
  return (globalForPrisma.prisma ??= createClient());
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const c = client();
    const value = Reflect.get(c, prop, c);
    // $transaction、$queryRaw 這類方法要綁回真正的 client，this 才會對
    return typeof value === "function" ? value.bind(c) : value;
  },
});
