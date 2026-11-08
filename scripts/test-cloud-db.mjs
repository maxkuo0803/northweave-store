// 連線診斷：用網站本身用的 mariadb 驅動測試能不能登入雲端資料庫。
// 只會印出密碼「長度」和有沒有空白，不會印出密碼內容。
import mariadb from "mariadb";

const pw = process.env.TIDB_PASSWORD ?? "";
console.log(`密碼長度：${pw.length} 個字元${/^\s|\s$/.test(pw) ? "（前後有空白，可能貼錯了）" : ""}${/[\r\n]/.test(pw) ? "（含換行，可能貼錯了）" : ""}`);

try {
  const conn = await mariadb.createConnection({
    host: process.env.TIDB_HOST,
    port: Number(process.env.TIDB_PORT),
    user: process.env.TIDB_USER,
    password: pw,
    ssl: { rejectUnauthorized: true },
    connectTimeout: 10000,
  });
  const [row] = await conn.query("SELECT CURRENT_USER() AS u, VERSION() AS v");
  console.log(`連線成功：${row.u}，${row.v}`);
  await conn.end();
} catch (e) {
  console.log(`連線失敗：${e.code ?? ""} ${e.sqlMessage ?? e.message}`);
  process.exit(1);
}
