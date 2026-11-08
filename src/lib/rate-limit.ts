import "server-only";
import { headers } from "next/headers";
import { prisma } from "./prisma";

/**
 * 簡單的「固定時間窗」限流：同一個 key 在 windowSec 秒內最多 max 次。
 * 資料存在資料庫（RateLimit 表），因為 Vercel 會同時開很多台機器，存在記憶體裡會各算各的。
 * 用來擋暴力破解密碼、大量註冊、洗訂單。
 * 回傳 true 代表可以繼續；false 代表太頻繁。
 */
export async function rateLimit(key: string, max: number, windowSec: number): Promise<boolean> {
  const now = Date.now();
  const windowStart = BigInt(now - windowSec * 1000);
  const k = `action:${key}`;

  // 1) 時間窗內、次數還沒滿 → 次數 +1（條件式更新，多台機器同時打也不會算錯）
  const inc = await prisma.rateLimit.updateMany({
    where: { key: k, lastRequest: { gt: windowStart }, count: { lt: max } },
    data: { count: { increment: 1 } },
  });
  if (inc.count > 0) return true;

  // 2) 時間窗已過 → 重新計算
  const reset = await prisma.rateLimit.updateMany({
    where: { key: k, lastRequest: { lte: windowStart } },
    data: { count: 1, lastRequest: BigInt(now) },
  });
  if (reset.count > 0) return true;

  // 3) 第一次出現 → 建立；如果已存在（代表次數已滿）就擋下
  try {
    await prisma.rateLimit.create({ data: { id: crypto.randomUUID(), key: k, count: 1, lastRequest: BigInt(now) } });
    return true;
  } catch {
    return false;
  }
}

// 使用者的 IP。Vercel 會把真正的來源 IP 放在 x-forwarded-for 第一個（會覆蓋使用者自己偽造的值）
export async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

export const TOO_MANY = "操作太頻繁，請稍後再試";
