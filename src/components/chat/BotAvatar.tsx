import { useId } from "react";
import { cn } from "@/lib/utils";

// AI 客服「小織」的頭像：用跟吊牌一樣的紙箱板做成的機器人頭。
// - 臉：牛皮紙色 + 一圈縫線（布市的手作感）
// - 眼睛：黑色面罩上的螢光黃眼睛，每隔幾秒眨一次
// - 天線：一根縫衣針，針眼穿著螢光黃的線；thinking=true 時針頭會亮（AI 正在查資料）
// 動畫在 globals.css（bot-blink / bot-think），開啟「減少動態效果」時會停掉。
export function BotAvatar({ className, thinking = false }: { className?: string; thinking?: boolean }) {
  // 同一頁會有很多個頭像，紋路的 id 要各自不同
  const grain = `bot-grain-${useId().replace(/:/g, "")}`;
  return (
    <svg viewBox="0 0 64 64" className={cn("shrink-0 overflow-visible", className)} aria-hidden>
      {/* 天線：縫衣針 + 穿過針眼的線 */}
      <path d="M32 15 L32 4" stroke="#4a5054" strokeWidth="2.4" strokeLinecap="round" />
      <ellipse cx="32" cy="6.5" rx="1.6" ry="2.8" fill="none" stroke="#4a5054" strokeWidth="1.4" />
      <path d="M33.5 6 C40 3 43 9 39 12" fill="none" stroke="#efeb2a" strokeWidth="1.6" strokeLinecap="round" className={cn(thinking && "bot-think")} />

      {/* 耳朵：鐵灰色螺栓 */}
      <rect x="7" y="27" width="6" height="14" rx="2" fill="#4a5054" />
      <rect x="51" y="27" width="6" height="14" rx="2" fill="#4a5054" />

      {/* 紙張陰影：頭底下一圈柔和的影子（跟吊牌一樣的「紙的厚度」） */}
      <ellipse cx="32" cy="53.5" rx="17" ry="2.4" fill="#000" fillOpacity=".2" />

      {/* 頭：紙箱板 + 細紋 + 縫線 */}
      <rect x="12" y="15" width="40" height="38" rx="7" fill="#c69c66" />
      <rect x="12" y="15" width="40" height="38" rx="7" fill={`url(#${grain})`} />
      <rect x="15.5" y="18.5" width="33" height="31" rx="4.5" fill="none" stroke="#8d6a3e" strokeWidth="1.1" strokeDasharray="2.2 2.2" />

      {/* 面罩與眼睛 */}
      <rect x="18" y="24" width="28" height="14" rx="5" fill="#161514" />
      <g className="bot-blink">
        <rect x="23" y="27.5" width="5" height="7" rx="2.5" fill="#efeb2a" />
        <rect x="36" y="27.5" width="5" height="7" rx="2.5" fill="#efeb2a" />
      </g>
      {/* 面罩反光 */}
      <path d="M21 26.5 L25 26.5" stroke="#fff" strokeOpacity=".35" strokeWidth="1.2" strokeLinecap="round" />

      {/* 微笑 */}
      <path d="M27.5 43 Q32 46.5 36.5 43" fill="none" stroke="#161514" strokeWidth="2" strokeLinecap="round" />

      <defs>
        <pattern id={grain} width="5" height="5" patternUnits="userSpaceOnUse">
          <rect width="2" height="5" fill="#000" fillOpacity=".05" />
        </pattern>
      </defs>
    </svg>
  );
}
