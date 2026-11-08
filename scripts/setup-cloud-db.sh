#!/bin/zsh
# 把資料表和假資料建到雲端 TiDB 資料庫。
# 用法：npm run db:cloud-setup
# 第一次會請你貼上 TiDB 密碼（輸入時不會顯示），連線成功後把完整連線字串存在
# .env.production.local（不進版控），之後再跑就不用再輸入密碼；部署到 Vercel 時也要用這個字串。
set -e
export PATH="$HOME/.local/node/bin:$PATH"
cd "$(dirname "$0")/.."

TIDB_HOST="gateway01.ap-northeast-1.prod.aws.tidbcloud.com"
TIDB_PORT="4000"
TIDB_USER="K8ZYSZnBZiZAyBd.root"
TIDB_DB="clothing_shop"

if [ -f .env.production.local ]; then
  echo "使用已儲存的連線（.env.production.local）"
  export DATABASE_URL="$(sed -n 's/^DATABASE_URL="\(.*\)"$/\1/p' .env.production.local)"
else
  # 不用貼上：直接從剪貼簿讀密碼，避免把其他文字誤貼進終端機
  while true; do
    echo "請在 TiDB 的 Connect 視窗，按 PASSWORD 旁邊的「複製」圖示，然後回到這裡按 Enter。"
    read -r _
    TIDB_PASSWORD="$(pbpaste | tr -d '\r\n')"
    if [ ${#TIDB_PASSWORD} -eq 16 ] && [[ "$TIDB_PASSWORD" != *" "* ]]; then
      echo "剪貼簿裡是 16 個字元的密碼，開始連線。"
      break
    fi
    echo "剪貼簿裡的內容有 ${#TIDB_PASSWORD} 個字元，不像 TiDB 密碼（應該是 16 個字元、沒有空白）。請重新按複製圖示。"
    echo
  done

  # 先測試連線，密碼錯就不用往下跑
  export TIDB_PASSWORD TIDB_HOST TIDB_PORT TIDB_USER
  echo "0/2 測試連線…"
  node scripts/test-cloud-db.mjs

  # 密碼可能含有特殊符號，要先做網址編碼（透過環境變數傳，不會出現在指令列）
  ENCODED=$(node -e 'process.stdout.write(encodeURIComponent(process.env.TIDB_PASSWORD))')
  export DATABASE_URL="mysql://${TIDB_USER}:${ENCODED}@${TIDB_HOST}:${TIDB_PORT}/${TIDB_DB}?sslaccept=strict"
  (umask 077; printf 'DATABASE_URL="%s"\n' "$DATABASE_URL" > .env.production.local)
  echo "連線字串已存到 .env.production.local"
fi

echo "1/2 建立資料表（prisma migrate deploy）…"
npx prisma migrate deploy
echo "2/2 放入假資料（約 30 秒）…"
npx prisma db seed

echo
echo "完成！雲端資料庫已經有資料了。"
echo "部署到 Vercel 時，DATABASE_URL 用 .env.production.local 裡的那一串。"
