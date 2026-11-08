# 部署教學：把北織放上網路（免費）

最後的架構：

```
GitHub（放程式碼）──自動部署──▶ Vercel（跑網站）──連線──▶ TiDB Cloud（雲端 MySQL）
```

| 服務 | 做什麼 | 費用 |
|---|---|---|
| GitHub | 存程式碼，作品集連結 | 免費 |
| Vercel Hobby | 跑 Next.js 網站，每次 push 自動更新 | 個人非商業用途免費 |
| TiDB Cloud Starter | 相容 MySQL 的雲端資料庫 | 有免費額度 |

> 免費方案的額度和條款會變，註冊時以官網說明為準。

---

## 第 1 步：建立雲端資料庫（TiDB Cloud）

1. 到 https://tidbcloud.com 註冊（可以用 GitHub 或 Google 帳號）。
2. 建立一個 **Starter**（免費）cluster，地區選 **Tokyo (ap-northeast-1)**，離台灣最近、速度最快。
3. 進入 cluster → 左邊 **SQL Editor**，執行：
   ```sql
   CREATE DATABASE clothing_shop;
   ```
4. 右上角 **Connect** → 選 **General** → 按 **Generate Password**，把密碼存好（只會顯示一次）。
5. 把畫面上的資訊組成一條連線字串（注意最後的 `?sslaccept=strict`，雲端一定要加密連線）：
   ```
   mysql://使用者:密碼@主機:4000/clothing_shop?sslaccept=strict
   ```
   例如：`mysql://3abc.root:你的密碼@gateway01.ap-northeast-1.prod.aws.tidbcloud.com:4000/clothing_shop?sslaccept=strict`

   密碼裡如果有 `@`、`#`、`/` 等符號，要先換成網址編碼（例如 `@` → `%40`）。

## 第 2 步：在雲端資料庫建立資料表與假資料

在自己電腦的專案資料夾執行：

```bash
npm run db:cloud-setup
```

腳本會請你到 TiDB 按「複製密碼」，測試連線後把連線字串存到 `.env.production.local`（不進版控），再建立資料表、放入假資料。

正式站的管理員密碼：在 `.env.production.local` 加一行 `ADMIN_PASSWORD="一組隨機密碼"` 再跑一次，seed 就會用它（不公開；公開的是 staff 展示帳號）。

> `db:deploy` 和本機用的 `db:migrate` 不同：deploy 只「套用」已經寫好的 migration，不會產生新的，正式環境都用這個。

## 第 3 步：部署到 Vercel

1. 到 https://vercel.com 用 **GitHub 帳號**註冊（選 Hobby 方案）。
2. **Add New → Project**，選 GitHub 上的 `northweave-store`，按 **Import**。
3. Framework 會自動認出 Next.js，不用改。展開 **Environment Variables**，加入三個：

   | 名稱 | 值 |
   |---|---|
   | `DATABASE_URL` | 第 1 步的連線字串 |
   | `AUTH_SECRET` | 在終端機執行 `openssl rand -base64 32` 產生一組新的（不要用本機那組） |
   | `BETTER_AUTH_URL` | 先填 `https://northweave-store.vercel.app`（之後改成實際網址） |

4. 按 **Deploy**，等 1–2 分鐘。
5. 完成後 Vercel 會給你網址（例如 `https://northweave-store-xxxx.vercel.app`）。如果跟第 3 點填的不同，到 **Settings → Environment Variables** 把 `BETTER_AUTH_URL` 改成實際網址，然後 **Deployments → 最新一筆 → Redeploy**。
6. **建議**：**Settings → Functions → Function Region** 改成 **Tokyo (hnd1)**，跟資料庫同一區，網頁會快很多。

## 第 4 步：之後怎麼更新

改完程式 → `git commit` → `git push`，Vercel 會自動重新部署，大約 1 分鐘後網站就更新了。

如果改了 `prisma/schema.prisma`：
1. 本機先 `npm run db:migrate` 產生新的 migration 檔並 commit。
2. 對雲端資料庫執行一次 `npm run db:deploy`（同第 2 步，設定 `DATABASE_URL`）。
3. 再 push。

## 常見問題

- **網站打開是 500 錯誤**：多半是 `DATABASE_URL` 打錯或少了 `?sslaccept=strict`。到 Vercel 專案 → **Logs** 看錯誤訊息。
- **登入後一直跳回登入頁**：`BETTER_AUTH_URL` 跟實際網址不一致，照第 3 步第 5 點修正。
- **想重置雲端的假資料**：照第 2 步再跑一次 `npm run db:seed`。
- **金鑰安全**：`.env.local` 不會上傳到 GitHub；雲端的密碼只放在 Vercel 的環境變數裡。
