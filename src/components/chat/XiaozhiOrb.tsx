import { useId } from "react";
import { cn } from "@/lib/utils";

// 小織的新樣子：一顆會發光的「線團」（像 Siri 的光球，但用北織的布、線來做）。
// 五圈線繞著深色的球轉，狀態不同動法不同：
// - idle      平常：慢慢轉、輕輕呼吸
// - listening 在聽你說話：光變亮、一直脈動
// - thinking  在查資料：線轉得很快
// - speaking  在說話：一下一下地鼓動
// 動畫寫在 globals.css（.orb-*），開啟「減少動態效果」時全部停下。
export type OrbState = "idle" | "listening" | "thinking" | "speaking";

export function XiaozhiOrb({ state = "idle", className }: { state?: OrbState; className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <span className={cn("orb relative inline-block shrink-0", `orb-${state}`, className)} aria-hidden>
      {/* 外圍的光暈 */}
      <span className="orb-glow absolute inset-[-18%] rounded-full" />
      <svg viewBox="0 0 100 100" className="orb-body relative block h-full w-full overflow-visible">
        <defs>
          <radialGradient id={`core-${id}`} cx="38%" cy="32%" r="70%">
            <stop offset="0%" stopColor="#4a5054" />
            <stop offset="55%" stopColor="#1d1f20" />
            <stop offset="100%" stopColor="#0b0b0b" />
          </radialGradient>
          <clipPath id={`clip-${id}`}>
            <circle cx="50" cy="50" r="44" />
          </clipPath>
        </defs>
        <circle cx="50" cy="50" r="44" fill={`url(#core-${id})`} />
        {/* 五圈線：螢光黃、紙箱板色、白色，各自用不同速度繞 */}
        <g clipPath={`url(#clip-${id})`} fill="none" strokeLinecap="round">
          <g className="orb-ring orb-ring-1">
            <ellipse cx="50" cy="50" rx="40" ry="13" stroke="#ece63a" strokeWidth="3.2" />
          </g>
          <g className="orb-ring orb-ring-2">
            <ellipse cx="50" cy="50" rx="38" ry="16" stroke="#c9a06b" strokeWidth="2.6" />
          </g>
          <g className="orb-ring orb-ring-3">
            <ellipse cx="50" cy="50" rx="36" ry="11" stroke="#fcfbf7" strokeOpacity=".8" strokeWidth="1.8" />
          </g>
          <g className="orb-ring orb-ring-4">
            <ellipse cx="50" cy="50" rx="41" ry="20" stroke="#ece63a" strokeOpacity=".35" strokeWidth="1.2" />
          </g>
          <g className="orb-ring orb-ring-5">
            <ellipse cx="50" cy="50" rx="39" ry="7" stroke="#c9a06b" strokeOpacity=".5" strokeWidth="1.2" />
          </g>
          {/* 縫線：一圈虛線，像布邊 */}
          <circle cx="50" cy="50" r="38" stroke="#fcfbf7" strokeOpacity=".18" strokeWidth="1" strokeDasharray="2 3" />
        </g>
        {/* 玻璃反光 */}
        <ellipse cx="36" cy="28" rx="13" ry="7" fill="#fff" fillOpacity=".14" transform="rotate(-25 36 28)" />
        <circle cx="50" cy="50" r="44" fill="none" stroke="#fff" strokeOpacity=".12" strokeWidth="1" />
      </svg>
    </span>
  );
}
