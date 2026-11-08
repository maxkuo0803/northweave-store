# NORTHWEAVE 北織 — 服飾電商 + AI 客服 BOT 作品集

一個「從登入到退換貨」功能完整的服飾電商網站（虛構品牌、假資料），之後會串接 AI 客服 BOT，讓 BOT 能查訂單、查物流、回答退換貨規則。

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
