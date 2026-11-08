@AGENTS.md

# AI 客服 BOT 作品集

虛構服飾品牌「NORTHWEAVE 北織」的電商網站（已完成）+ AI 客服 BOT（下一階段）。
使用者正在學習架網站：說明要白話、程式碼加中文註解；優先選免費 / 低成本方案。

## 技術棧
- Next.js 16 App Router + TypeScript + Tailwind v4（`cacheComponents` 刻意關閉，用傳統動態渲染）
- MySQL 8.4（本機安裝在 `~/.local/mysql`，資料在 `~/.local/mysql-data`，`npm run db:start` 啟動）
- Prisma 7：設定檔是 `prisma7.config.ts`（讀 `.env.local`），client 產生到 `src/generated/prisma`，用 `@prisma/adapter-mariadb`
- Better Auth（email + 密碼、admin plugin 管角色），Zod 驗證
- AI：`@anthropic-ai/sdk`，模型由 `CLAUDE_MODEL` 環境變數決定

## 設計
- 視覺系統是「布市攤位」，規則與色票見 `DESIGN.md`（紅色麥克筆一個畫面只用一次、直角、紙張陰影）

## 慣例
- 金額一律 Int（新台幣），在伺服器端計算（`src/lib/pricing.ts`）
- 商業規則集中在 `src/lib/store-config.ts`（運費、鑑賞期、狀態中文標籤）—— BOT 也要讀這份
- 每個 Server Action 開頭都要 `requireUser()` / `requireAdmin()`，查詢條件帶 `userId` 防越權
- 改庫存用條件式 `updateMany({ where: { stock: { gte } } })` 防超賣
- 訂單 / 退換貨狀態變更要寫 `OrderStatusHistory`

## 指令
- `npm run dev`、`npm run lint`、`npx tsc --noEmit`
- `npm run db:migrate` / `db:seed` / `db:studio`
- Demo 帳號見 README

## 環境
- Node.js 在 `~/.local/node/bin`（已加入 `~/.zshrc`）
- 金鑰與 DB 連線在 `.env.local`（不進版控）
