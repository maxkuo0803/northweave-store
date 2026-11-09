import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// LINE 官方帳號（Messaging API）。到 LINE Developers 建立 Messaging API channel 後取得：
// - LINE_CHANNEL_SECRET：驗證 webhook 真的是 LINE 送來的
// - LINE_CHANNEL_ACCESS_TOKEN：用來回訊息
// 免費方案：reply（回覆）不限次數；push（主動推播）每月有額度，所以能用 reply 就用 reply。

export const lineConfigured = () => !!(process.env.LINE_CHANNEL_SECRET && process.env.LINE_CHANNEL_ACCESS_TOKEN);

// 驗證簽章：LINE 用 channel secret 對整個 body 做 HMAC-SHA256，放在 x-line-signature。
// 沒通過就是偽造的請求，直接拒絕。
export function verifyLineSignature(rawBody: string, signature: string | null) {
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const given = Buffer.from(signature, "base64");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

async function lineApi(path: string, body?: object) {
  const res = await fetch(`https://api.line.me/v2/bot/${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`LINE API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.status === 200 ? res.json().catch(() => ({})) : {};
}

// LINE 單則訊息上限 5000 字
const toMessages = (text: string) => [{ type: "text", text: text.slice(0, 4900) }];

export const lineReply = (replyToken: string, text: string) => lineApi("message/reply", { replyToken, messages: toMessages(text) });
export const linePush = (to: string, text: string) => lineApi("message/push", { to, messages: toMessages(text) });

export async function lineProfileName(userId: string): Promise<string | null> {
  try {
    const p = (await lineApi(`profile/${encodeURIComponent(userId)}`)) as { displayName?: string };
    return p.displayName ?? null;
  } catch {
    return null;
  }
}

export type LineEvent = {
  type: string;
  replyToken?: string;
  source?: { type: string; userId?: string };
  message?: { type: string; id: string; text?: string };
};
