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

// 選項按鈕 → LINE 的「快速回覆」（訊息下方一排按鈕，按下去就幫顧客傳出那句話）
export type QuickChoice = { label: string; reply: string };

// LINE 單則訊息上限 5000 字；快速回覆最多 13 個、按鈕字最多 20 字
const toMessages = (text: string, choices?: QuickChoice[]) => [
  {
    type: "text",
    text: text.slice(0, 4900),
    ...(choices?.length && {
      quickReply: { items: choices.slice(0, 13).map((c) => ({ type: "action", action: { type: "message", label: c.label.slice(0, 20), text: c.reply.slice(0, 300) } })) },
    }),
  },
];

export const lineReply = (replyToken: string, text: string, choices?: QuickChoice[]) => lineApi("message/reply", { replyToken, messages: toMessages(text, choices) });
export const linePush = (to: string, text: string, choices?: QuickChoice[]) => lineApi("message/push", { to, messages: toMessages(text, choices) });

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
