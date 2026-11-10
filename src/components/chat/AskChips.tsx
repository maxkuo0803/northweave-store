"use client";

import { cn } from "@/lib/utils";
import { BotAvatar } from "./BotAvatar";
import { askXiaozhi, track } from "./ask";

// 頁面裡的「問小織」小按鈕：放在顧客最容易卡住的地方（尺寸旁、搜尋結果、購物車、訂單）。
// 長得像店員手上的便條：小頭像 + 幾個常見問題，點一下就打開小織並直接問。
export function AskChips({
  questions,
  source,
  title = "問店員小織",
  className,
}: {
  questions: { label: string; text: string }[];
  source: string;
  title?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <span className="mr-0.5 flex items-center gap-1.5 text-xs font-bold text-muted">
        <BotAvatar className="h-6 w-6" />
        {title}
      </span>
      {questions.map((q) => (
        <button
          key={q.label}
          type="button"
          onClick={() => {
            track("chip_click", source);
            askXiaozhi({ text: q.text, source });
          }}
          className="rounded-full border border-ink/15 bg-white/70 px-3 py-1.5 text-xs font-bold transition-colors hover:border-ink hover:bg-white"
        >
          {q.label}
        </button>
      ))}
    </div>
  );
}

// 單一按鈕版（搜尋找不到、購物車湊免運）
export function AskButton({ label, text, source, className }: { label: string; text: string; source: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        track("chip_click", source);
        askXiaozhi({ text, source });
      }}
      className={cn("inline-flex items-center gap-2 rounded-full bg-ink py-1.5 pr-4 pl-1.5 text-sm font-bold text-white transition-colors hover:bg-black", className)}
    >
      <span className="grid h-7 w-7 place-items-center rounded-full bg-white/10">
        <BotAvatar className="h-6 w-6" />
      </span>
      {label}
    </button>
  );
}
