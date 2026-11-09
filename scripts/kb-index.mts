// 建立 / 更新 AI 客服知識庫索引
//   本機：npm run kb:index
//   雲端：DATABASE_URL="雲端連線字串" VOYAGE_API_KEY="..." npm run kb:index
// 已經存在的環境變數不會被 .env.local 覆蓋，所以雲端用法會連到雲端資料庫。
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

const { reindexAll } = await import("../src/lib/knowledge/indexer");
const { prisma } = await import("../src/lib/prisma");

const host = (process.env.DATABASE_URL ?? "").replace(/^.*@([^:/]+).*$/, "$1");
console.log(`資料庫：${host}`);
console.log(process.env.VOYAGE_API_KEY ? "模式：語意 + 關鍵字（會計算向量）" : "模式：只有關鍵字（沒有 VOYAGE_API_KEY）");
const stats = await reindexAll();
console.log("完成！", stats);
await prisma.$disconnect();
