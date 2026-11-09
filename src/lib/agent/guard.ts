import "server-only";

// AI 客服的安全檢查（在訊息送進模型「之前」和模型回覆「之後」各做一次）。
// 原則：模型可能被騙，所以真正的保護放在程式碼裡，不只靠提示詞。

// ── 1. 個資遮罩：顧客不小心貼了卡號、身分證，我們不存、也不送給 AI ──
const PATTERNS: { name: string; re: RegExp; mask: string }[] = [
  // 信用卡號：13–19 位數字（中間可有空白或 -）
  { name: "信用卡號", re: /\b(?:\d[ -]?){12,18}\d\b/g, mask: "[已遮蔽的卡號]" },
  // 台灣身分證字號 / 居留證：1 個英文 + 9 個數字
  { name: "身分證字號", re: /\b[A-Za-z][1289]\d{8}\b/g, mask: "[已遮蔽的身分證字號]" },
  // 信用卡安全碼、密碼這類「關鍵字 + 值」
  { name: "安全碼", re: /(cvv|cvc|安全碼|背面三碼)\s*[:：是為]?\s*\d{3,4}/gi, mask: "$1 [已遮蔽]" },
  { name: "密碼", re: /(密碼|password|pwd)\s*[:：是為]?\s*\S+/gi, mask: "$1 [已遮蔽]" },
];

export function redactPII(text: string) {
  const found: string[] = [];
  let out = text;
  for (const p of PATTERNS) {
    if (p.re.test(out)) found.push(p.name);
    p.re.lastIndex = 0;
    out = out.replace(p.re, p.mask);
  }
  return { text: out, found };
}

// ── 2. 直接轉人工的情況：不浪費 AI 費用，也避免 AI 處理不該處理的事 ──
const HANDOFF_RULES: { reason: string; re: RegExp }[] = [
  { reason: "顧客要求真人客服", re: /(真人|人工|客服人員|專人|找主管|轉接)/ },
  { reason: "顧客提到法律 / 申訴", re: /(消保官|消基會|律師|提告|告你|法院|檢舉|投訴)/ },
  { reason: "顧客情緒激動", re: /(爛透|垃圾店|詐騙|騙子|氣死|爛死了)/ },
  { reason: "可能涉及安全或身體傷害", re: /(過敏|受傷|燙傷|起疹|紅腫)/ },
];

export function handoffTrigger(text: string): string | null {
  return HANDOFF_RULES.find((r) => r.re.test(text))?.reason ?? null;
}

// ── 3. 提示詞注入（叫 AI 忽略規則、扮演別人、吐出系統提示）：不擋訊息，但記錄下來，並提醒模型 ──
const INJECTION = /(ignore (all|previous|above)|忽略(之前|以上|前面)的?(指令|規則|設定)|system prompt|系統提示|你現在是|developer mode|越獄|jailbreak|扮演)/i;
export const looksLikeInjection = (text: string) => INJECTION.test(text);

// ── 4. 輸出檢查：AI 的回覆送出前再掃一次 ──
// 就算模型出錯，也不會把卡號、別人的 Email、內部資料送出去
export function checkOutput(text: string, allowedEmails: string[] = []) {
  const issues: string[] = [];
  // 去掉 Markdown 粗體 / 標題符號（LINE、Email 不會轉成粗體，只會顯示星號）
  let out = redactPII(text).text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/^#{1,6}\s+/gm, "");
  out = out.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, (m) => {
    if (allowedEmails.includes(m.toLowerCase())) return m;
    issues.push(`移除了不該出現的 Email：${m}`);
    return "[Email 已隱藏]";
  });
  // 不讓模型講出系統內部的東西
  if (/(ANTHROPIC|API[_ ]?KEY|DATABASE_URL|system prompt|系統提示詞)/i.test(out)) {
    issues.push("回覆疑似洩漏內部資訊，已改成安全回覆");
    out = "這個問題我沒辦法回答喔。有其他商品、訂單或退換貨的問題，我很樂意幫忙！";
  }
  return { text: out.slice(0, 2000), issues };
}

// 顯示給顧客看的部分遮罩：王小明 → 王*明、0912345678 → 0912***678
export function maskName(name: string) {
  if (name.length <= 1) return name;
  if (name.length === 2) return name[0] + "*";
  return name[0] + "*".repeat(name.length - 2) + name[name.length - 1];
}
export function maskPhone(p: string) {
  return p.length >= 7 ? p.slice(0, 4) + "***" + p.slice(-3) : "***";
}
// Email 遮罩：demo@northweave.test → d***@northweave.test（讓顧客認得出是哪個帳號，但不完整外露）
export function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  return `${name.slice(0, 1)}***@${domain ?? ""}`;
}
