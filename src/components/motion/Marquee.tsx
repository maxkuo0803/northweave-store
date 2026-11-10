import { cn } from "@/lib/utils";

/**
 * LED 跑馬燈：像老店門口的紅字燈箱，一直往左跑。
 * 內容重複兩次接起來，跑到一半剛好接回開頭，看起來就是無限循環。
 * 第二份只是視覺用，螢幕閱讀器只會讀一次（aria-hidden）。滑鼠移上去會暫停。
 */
export function Marquee({ items, className }: { items: string[]; className?: string }) {
  const row = (hidden?: boolean) => (
    <ul aria-hidden={hidden || undefined} className="flex shrink-0 items-center">
      {items.map((t, i) => (
        <li key={i} className="flex items-center gap-8 pr-8 whitespace-nowrap">
          {t}
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
        </li>
      ))}
    </ul>
  );
  return (
    <div className={cn("marquee overflow-hidden", className)}>
      <div className="marquee-track flex w-max">
        {row()}
        {row(true)}
      </div>
    </div>
  );
}
