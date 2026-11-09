import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { pollGmail } from "@/lib/channels/inbound";

// 定時收 Gmail 客服信（每幾分鐘呼叫一次）。
// Vercel Cron 會自動帶上 Authorization: Bearer <CRON_SECRET>；用 cron-job.org 的話自己加這個 header。
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (!secret || given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await pollGmail());
  } catch (e) {
    console.error("[gmail] poll failed", e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
