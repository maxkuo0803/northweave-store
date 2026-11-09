import { NextResponse, after } from "next/server";
import { verifyLineSignature, type LineEvent } from "@/lib/channels/line";
import { handleLineEvent } from "@/lib/channels/inbound";

// LINE 官方帳號的 Webhook：在 LINE Developers 後台把 Webhook URL 設成
//   https://你的網域/api/webhooks/line
export const maxDuration = 60;

export async function POST(req: Request) {
  const raw = await req.text();
  // 一定要先驗簽章：確認真的是 LINE 送來的，不是有人偽造
  if (!verifyLineSignature(raw, req.headers.get("x-line-signature"))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }
  const { events = [] } = JSON.parse(raw) as { events?: LineEvent[] };
  // LINE 要求 webhook 很快回 200，所以 AI 的處理放到回應之後（after）再做
  after(async () => {
    for (const ev of events) {
      try {
        await handleLineEvent(ev);
      } catch (e) {
        console.error("[line] event failed", e);
      }
    }
  });
  return NextResponse.json({ ok: true });
}
