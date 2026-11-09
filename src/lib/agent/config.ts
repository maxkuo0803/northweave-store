import "server-only";

// AI 客服的設定集中在這裡。

// 模型：客服問答 + 查資料用最便宜的 Haiku 就夠了（每百萬 token 輸入 US$0.10 / 輸出 US$0.50）。
// 一般一輪對話約 5,000–15,000 token，大概 US$0.001–0.003（不到台幣一毛）。
// 想換模型就改環境變數 AGENT_MODEL。
export const AGENT_MODEL = process.env.AGENT_MODEL || "claude-haiku-5-5";

// 價格（美元 / 每百萬 token），只用來在後台估算花費
export const PRICE_PER_MTOK = { input: 0.1, output: 0.5 };

// 沒設定 API Key 時改用「模擬模式」：規則式的假模型，流程（查資料、轉人工、追蹤）完全一樣，
// 方便沒有金鑰也能 Demo。AGENT_MODE=mock 可以強制使用。
export const isMockMode = () => process.env.AGENT_MODE === "mock" || !process.env.ANTHROPIC_API_KEY;

export const LIMITS = {
  maxInputChars: 1000, // 顧客一則訊息最多幾個字（太長的訊息通常是亂貼或攻擊）
  historyMessages: 16, // 送給模型的歷史訊息數（越多越貴）
  maxToolRounds: 5, // 一次回覆最多呼叫幾輪工具，避免無限迴圈燒錢
  maxOutputTokens: 1500,
  perConversationPerMinute: 6, // 同一段對話每分鐘最多幾則（防洗版）
  perVisitorPerDay: 60,
  globalPerDay: Number(process.env.AGENT_DAILY_LIMIT || 2000), // 全站每天最多 AI 回覆次數：費用上限保險絲
};

export function estimateCostUsd(inputTokens: number, outputTokens: number) {
  return (inputTokens * PRICE_PER_MTOK.input + outputTokens * PRICE_PER_MTOK.output) / 1_000_000;
}
