@AGENTS.md

# AI 客服 BOT 作品集

一個假的電商網站 + 串接該網站資料的 AI 客服機器人，用於作品集展示。

## 技術棧
- **Next.js (App Router) + TypeScript + Tailwind CSS v4**：前台商店與後端 API 同一個專案
- **資料庫**：Node 內建 `node:sqlite`（不需原生編譯），檔案放在 `data/shop.db`，種子腳本 `scripts/seed.ts`（用 `npx tsx` 執行）
- **AI**：`@anthropic-ai/sdk`，以 tool use 讓 BOT 查詢商品、訂單、物流、退換貨政策；`zod` 驗證工具輸入
- 模型由 `CLAUDE_MODEL` 環境變數決定（預設 `claude-sonnet-5-5`）

## 預計目錄
- `src/app/` 商店頁面（首頁、商品列表/詳情、購物車、訂單查詢）
- `src/app/api/chat/route.ts` 客服 BOT API（串流回應）
- `src/lib/db.ts` 資料庫存取；`src/lib/bot/` 系統提示、工具定義與執行
- `src/components/ChatWidget.tsx` 右下角浮動客服視窗
- `data/` SQLite 檔與 FAQ/政策文件

## 指令
- `npm run dev` 開發伺服器（http://localhost:3000）
- `npm run build` / `npm run lint`

## 環境
- Node.js 安裝於 `~/.local/node`（已加入 `~/.zshrc` 的 PATH）
- 金鑰放 `.env.local`（不進版控），範本見 `.env.example`
