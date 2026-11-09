# NORTHWEAVE 北織 — 服飾電商 + AI 客服 BOT 作品集

一個「從登入到退換貨」功能完整的服飾電商網站（虛構品牌、假資料），加上 AI 客服 BOT：在網站、LINE、Gmail 回答商品問題、主動推薦商品、查訂單與物流、代辦符合規定的退換貨，處理不了就轉真人客服。

## 功能

**顧客端**
- 註冊 / 登入 / 登出、修改個人資料與密碼
- 商品列表：分類、尺寸、顏色、特價篩選、排序、搜尋、分頁
- 商品頁：顏色 × 尺寸選擇、即時庫存、尺寸表、評論與尺寸回饋、收藏
- 購物車（存在資料庫，換裝置也看得到）、免運門檻進度條
- 結帳：宅配 / 超商取貨、多組收件地址、優惠碼、四種付款方式（模擬金流）
- 訂單：進度時間軸、物流單號、取消訂單（自動歸還庫存）、ATM 虛擬帳號
- 退換貨：7 天鑑賞期檢查、選商品與數量、換貨選尺寸、RMA 進度追蹤、取消申請

**管理後台**（`/admin`）
- 營運總覽：營收、客單價、待辦事項、低庫存警示
- 訂單管理：搜尋、狀態篩選、備貨 → 出貨（填物流單號）→ 送達 → 完成、取消
- 退換貨審核：核准 / 拒絕 → 收到退貨（回補庫存）→ 退款 / 寄出換貨（扣新 SKU 庫存）
- 商品與庫存：改價、特價、上下架、顏色 × 尺寸庫存矩陣
- 會員列表：訂單數、累計消費

## AI 客服「小織」

**顧客端**
- 網站右下角「問小織」聊天視窗；LINE 官方帳號；Gmail 客服信箱 —— 三個平台同一個 AI、同一套規則
- 回答商品（材質、尺寸、庫存）、運費、鑑賞期等問題；查訂單、物流、退換貨進度
- 代辦退換貨：先依規則檢查（7 天鑑賞期、可退數量、換貨庫存）→ 條列內容請顧客確認 → 顧客回覆「確認」才送出
- **主動推薦**：在商品頁 / 購物車停留一下，會跳出搭配推薦或「差多少免運」的提示（規則計算，不花 AI 費用；可關閉）
- 處理不了（例外、賠償、瑕疵、顧客不滿、要求真人）→ 自動轉真人客服

**AI 知識庫（Hybrid RAG）**（`/admin/knowledge`）
- 商品、FAQ、商店規則、有效優惠碼、購物指南（尺寸、布料保養、配送、退換貨、穿搭）整理成 80 多段「知識」
- 搜尋分四步：① 關鍵字（BM25，中文兩字一組切詞）② 語意（Voyage `voyage-4-lite` 向量 + 餘弦相似度）③ RRF 合併排名 ④ Voyage `rerank-3-lite` 重新排序
- 關鍵字擅長精確的東西（商品編號、優惠碼），語意擅長換句話說（「寄送要多少錢」→「運費」、「下雨天穿的外套」→「防潑水」）
- 資料量小，向量直接存在 MySQL 的 JSON 欄位、在程式裡計算，不用另外架向量資料庫
- 內容沒變就不重算向量；後台改商品會自動更新那件商品的知識
- 後台「搜尋測試器」可以看到每次搜尋各階段的分數與排名
- 沒有 `VOYAGE_API_KEY` 時自動退回只用關鍵字，網站照常運作

**後台「客服中心」**（`/admin/inbox`）
- 所有平台的對話集中管理，待人工的排最前面
- **AI 步驟追蹤**：每則訊息 AI 做了哪些安全檢查、呼叫哪些工具、輸入輸出、花幾秒、多少 token / 美金
- 真人直接回覆：系統自動用顧客來的平台回（網站 / LINE / Email），回覆後 AI 自動暫停，按「交還 AI」恢復

**個資與資安**
- AI 只能透過我們寫好的「工具」拿資料（`src/lib/agent/tools.ts`），查訂單一律用「已驗證的會員 ID」，不接受 AI 傳入的帳號
- 身分驗證：網站要登入；LINE 要用網站產生的綁定碼綁定；Email 要寄件者通過 SPF/DKIM 且是會員信箱。沒驗證只能問一般問題
- 顧客貼的信用卡號、身分證字號在存檔和送給 AI 之前就遮蔽；收件人姓名電話只給遮罩版本；庫存只說「有貨 / 少量 / 售完」
- 會改資料的動作（退換貨）由程式檢查「顧客真的在下一則訊息確認了」，不靠 AI 自律
- AI 回覆送出前再掃一次，擋掉卡號、不相關的 Email、疑似洩漏系統設定的內容
- 限流：每段對話每分鐘 6 則、每人每天 60 則、全站每天上限（`AGENT_DAILY_LIMIT`）
- LINE webhook 驗簽章、Gmail 定時收信要密碼；公開的展示店員帳號不能回覆真實 LINE / Email 顧客

**費用**：預設用 Claude Haiku 5.5（每百萬 token 輸入 US$0.10 / 輸出 US$0.50），系統提示詞有快取，一則回覆約 US$0.001–0.003。沒有設定 API Key 時自動使用「模擬模式」（關鍵字規則，免費），流程一樣可以 Demo。

### 建立知識庫索引
```bash
npm run kb:index          # 本機：重新整理知識庫、計算有變動內容的向量
```
正式站：先在 Vercel 設定 `VOYAGE_API_KEY`，部署後到後台「AI 知識庫」按「重建索引」。

### 串接 LINE 官方帳號
1. 到 [LINE Developers](https://developers.line.biz/) 建立 Provider → Messaging API channel（會同時建立官方帳號）
2. Basic settings 複製 **Channel secret** → `LINE_CHANNEL_SECRET`；Messaging API 頁籤發行 **Channel access token** → `LINE_CHANNEL_ACCESS_TOKEN`
3. Webhook URL 填 `https://你的網域/api/webhooks/line`，打開 Use webhook；到 LINE Official Account Manager 把「自動回應訊息」關掉
4. 顧客在網站「會員中心 → 綁定 LINE 客服」取得綁定碼，傳「綁定 123456」給官方帳號，之後就能查訂單

### 串接 Gmail
1. [Google Cloud Console](https://console.cloud.google.com/) 建專案 → 啟用 Gmail API → OAuth 同意畫面（外部、加自己為測試使用者）→ 建立 OAuth 用戶端（類型選「網頁應用程式」，重新導向 URI 加 `https://developers.google.com/oauthplayground`）
2. 到 [OAuth Playground](https://developers.google.com/oauthplayground)：右上齒輪勾「Use your own OAuth credentials」填入 Client ID / Secret → scope 填 `https://www.googleapis.com/auth/gmail.modify` → 授權 → 換取 token，複製 **Refresh token**
3. 填入 `GMAIL_ADDRESS`、`GMAIL_CLIENT_ID`、`GMAIL_CLIENT_SECRET`、`GMAIL_REFRESH_TOKEN`、`CRON_SECRET`
4. 定時收信：Vercel 免費方案的 Cron 一天只能跑一次，建議用免費的 [cron-job.org](https://cron-job.org) 每 5 分鐘呼叫 `GET https://你的網域/api/cron/gmail`，Header 加 `Authorization: Bearer <CRON_SECRET>`。後台客服中心也有「立即收 Gmail」按鈕
5. 自動寄的信（電子報、退信、no-reply）不會回，避免機器人互相回信

## 技術選擇（全部免費）

| 項目 | 選擇 | 為什麼 |
|---|---|---|
| 框架 | Next.js 16（App Router）+ TypeScript | 前後端同一個專案，業界最常見的 React 全端框架 |
| 樣式 | Tailwind CSS v4 | 不用另外寫 CSS 檔，設計變數集中在 `globals.css` |
| 資料庫 | MySQL 8.4 LTS | 依需求使用；本機開發免費，上線可用免費雲端 MySQL |
| ORM | Prisma 7 | 用 `schema.prisma` 定義資料表，自動產生 migration 與型別 |
| 登入 | Better Auth | 開源、資料存在自己的資料庫、密碼雜湊與 session 都處理好 |
| 驗證 | Zod | 所有表單在伺服器端驗證，不相信前端 |
| 假資料 | Faker + 自訂資料 | 固定亂數種子，每次產生的資料都一樣 |

## 本機啟動

需要：Node.js 20+、MySQL 8（這台電腦已安裝在 `~/.local`）

```bash
npm run db:start      # 啟動 MySQL（電腦重開機後要執行一次）
npm run dev           # http://localhost:3000
```

第一次在新電腦上設定：

```bash
npm install
cp .env.example .env.local   # 填入 DATABASE_URL 與 AUTH_SECRET
npm run db:migrate           # 建立資料表
npm run db:seed              # 產生假資料
```

### Demo 帳號

| 角色 | Email | 密碼 |
|---|---|---|
| 會員（有各種狀態的訂單） | demo@northweave.test | Demo1234! |
| 店員（可進後台處理訂單、退換貨，不能改商品） | staff@northweave.test | Staff1234! |
| 管理員（可改商品） | admin@northweave.test | 本機 `Admin1234!`；正式站用環境變數 `ADMIN_PASSWORD`，不公開 |
| 其他 45 位假會員 | 見 Prisma Studio | 每次 seed 隨機產生，無法登入 |

公開的展示帳號（demo、staff）不能改密碼和個人資料，避免被其他人鎖住。

### 資安措施

- 每個後台頁面和 Server Action 都各自檢查權限（不只靠 layout）
- 所有查詢都帶 `userId`，不能改網址看別人的訂單
- 登入、註冊、改密碼、下單都有限流（存在資料庫，多台機器共用）
- Content-Security-Policy（nonce）、HSTS、X-Frame-Options 等安全標頭
- 密碼用 Better Auth 雜湊；金鑰只放在環境變數，不進 Git

可用優惠碼：`WELCOME100`、`AUTUMN15`、`FREESHIP`（`SUMMER20` 已過期，用來測試錯誤訊息）

### 常用指令

| 指令 | 用途 |
|---|---|
| `npm run db:seed` | 清空並重新產生假資料（測試弄亂了就跑這個） |
| `npm run db:studio` | 開啟 Prisma Studio，用瀏覽器看 / 改資料庫內容 |
| `npm run db:migrate` | 改完 `prisma/schema.prisma` 後執行，產生資料庫變更 |
| `npm run lint` | 檢查程式碼 |

## 程式碼導覽（建議閱讀順序）

1. `prisma/schema.prisma` — 先看資料表怎麼設計：商品 → SKU（顏色 × 尺寸）→ 訂單 → 退換貨
2. `src/lib/store-config.ts` — 運費、鑑賞期、狀態中文名稱等商業規則
3. `src/lib/auth.ts`、`src/lib/session.ts`、`src/proxy.ts` — 登入怎麼運作、頁面怎麼保護
4. `src/app/products/` — Server Component 直接查資料庫渲染頁面
5. `src/lib/pricing.ts` + `src/app/checkout/actions.ts` — 金額只在伺服器計算；下單用 transaction 扣庫存防超賣
6. `src/lib/orders.ts` + `src/app/account/orders/actions.ts` — 退換貨資格判斷
7. `src/app/admin/actions.ts` — 後台每個動作都重新檢查管理員權限

```
prisma/
  schema.prisma        資料庫結構
  seed.ts              假資料產生器
src/
  app/                 頁面與 Server Actions（檔案路徑 = 網址）
    (auth)/            登入、註冊
    products/          商品列表、商品頁
    cart/ checkout/    購物車、結帳
    account/           會員中心：訂單、退換貨、地址、收藏、個人資料
    admin/             管理後台
    api/auth/          Better Auth API
    api/garment/       商品示意圖（SVG 產生器）
  components/          共用元件
  lib/                 資料存取與商業邏輯
  generated/prisma/    Prisma 自動產生（不進版控）
```

## 上線（免費方案）

| 服務 | 免費額度 | 用途 |
|---|---|---|
| [Vercel](https://vercel.com) Hobby | 個人作品免費 | 部署 Next.js |
| [TiDB Cloud Serverless](https://tidbcloud.com) 或 [Aiven MySQL](https://aiven.io/mysql) | 有免費方案 | 雲端 MySQL |

步驟：建立雲端 MySQL → 把連線字串設成 Vercel 的 `DATABASE_URL` → 執行 `prisma migrate deploy` 與 `db:seed` → 連接 GitHub 自動部署。
（免費方案的額度與條款會變動，申請前請以官網為準。）

## 說明

- 這是作品集網站，品牌、商品、會員、訂單全部是假資料。
- 金流、超商門市、Email 都是模擬：信用卡 / LINE Pay 送出即視為付款成功，不會收集任何卡號。
- 商品圖是程式依款式與顏色即時畫出的 SVG，換成真實照片只要改 `ProductImage.url`。
