import type { Channel, ConversationStatus } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

// 客服中心共用的小元件

export const CHANNEL_LABEL: Record<Channel, string> = { WEB: "網站", LINE: "LINE", EMAIL: "Email" };
export const STATUS_LABEL: Record<ConversationStatus, string> = {
  AI: "AI 處理中",
  WAITING_HUMAN: "待人工",
  HUMAN: "人工處理中",
  CLOSED: "已結束",
};
const STATUS_TONE: Record<ConversationStatus, string> = {
  AI: "bg-ink/10 text-ink",
  WAITING_HUMAN: "bg-warn/15 text-warn",
  HUMAN: "bg-sky-100 text-sky-800",
  CLOSED: "bg-ink/5 text-muted",
};

export function ConvStatusBadge({ status }: { status: ConversationStatus }) {
  return <span className={cn("badge", STATUS_TONE[status])}>{STATUS_LABEL[status]}</span>;
}

// 平台圖示（自己畫的 SVG，不用 emoji）
export function ChannelBadge({ channel }: { channel: Channel }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-ink/20 bg-card px-2 py-0.5 text-xs font-bold">
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
        {channel === "WEB" && (<><rect x="1.5" y="2.5" width="13" height="9" /><path d="M5 14h6M8 11.5V14" /></>)}
        {channel === "LINE" && (<><path d="M2 7c0-3 2.7-5 6-5s6 2 6 5-2.7 5-6 5c-.6 0-1.2 0-1.7-.2L3.5 13.5l.6-2.5C2.8 10 2 8.6 2 7z" /></>)}
        {channel === "EMAIL" && (<><rect x="1.5" y="3.5" width="13" height="9" /><path d="M1.5 4l6.5 5 6.5-5" /></>)}
      </svg>
      {CHANNEL_LABEL[channel]}
    </span>
  );
}
