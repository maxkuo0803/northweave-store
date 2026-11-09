import "server-only";

// Gmail 客服信箱（用 Gmail REST API，不另外裝套件）。
// 需要在 Google Cloud 建立 OAuth 用戶端並授權一次，取得 refresh token（步驟見 README「串接 Gmail」）：
// - GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN
// - GMAIL_ADDRESS：客服信箱地址（避免回覆自己寄的信造成無限循環）
// 收信方式：定時呼叫 /api/cron/gmail（Vercel Cron 或免費的 cron-job.org），或在後台按「立即收信」。

export const gmailConfigured = () =>
  !!(process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN && process.env.GMAIL_ADDRESS);

let cached: { token: string; exp: number } | null = null;

async function accessToken() {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID!,
      client_secret: process.env.GMAIL_CLIENT_SECRET!,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Gmail OAuth ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return cached.token;
}

async function gmail(path: string, init?: { method?: string; body?: object }) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    method: init?.method ?? (init?.body ? "POST" : "GET"),
    headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json" },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) throw new Error(`Gmail API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

type Part = { mimeType?: string; body?: { data?: string }; parts?: Part[]; headers?: { name: string; value: string }[] };
type GmailMessage = { id: string; threadId: string; payload: Part; snippet?: string };

const b64urlDecode = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
const b64urlEncode = (s: string) => Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function findText(part: Part): string | null {
  if (part.mimeType === "text/plain" && part.body?.data) return b64urlDecode(part.body.data);
  for (const p of part.parts ?? []) {
    const t = findText(p);
    if (t) return t;
  }
  // 只有 HTML 的信：粗略去掉標籤
  if (part.mimeType === "text/html" && part.body?.data) return b64urlDecode(part.body.data).replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ");
  return null;
}

// 去掉信件裡引用的舊內容（「於 xxx 寫道：」以下、> 開頭的行），只留新寫的
function stripQuoted(text: string) {
  const lines = text.replace(/\r/g, "").split("\n");
  const cut = lines.findIndex((l) => /^(On .+wrote:|於 .+寫道：|.+ 於 .+ 寫道：|-----Original Message-----|寄件者：|From: )/.test(l.trim()));
  return (cut >= 0 ? lines.slice(0, cut) : lines).filter((l) => !l.startsWith(">")).join("\n").trim();
}

export type IncomingEmail = {
  gmailId: string;
  threadId: string;
  fromAddress: string;
  fromName: string | null;
  subject: string;
  messageId: string | null;
  references: string | null;
  text: string;
  // 寄件者驗證：SPF 或 DKIM 通過，才相信寄件地址是真的（防止有人冒用會員 Email 查訂單）
  senderVerified: boolean;
  // 自動寄的信（電子報、退信、自動回覆）：不回，避免兩個機器人互相回到天荒地老
  automated: boolean;
};

export async function fetchUnreadEmails(max = 10): Promise<IncomingEmail[]> {
  const q = encodeURIComponent(`in:inbox is:unread -from:${process.env.GMAIL_ADDRESS} newer_than:3d`);
  const list = (await gmail(`messages?q=${q}&maxResults=${max}`)) as { messages?: { id: string }[] };
  const out: IncomingEmail[] = [];
  for (const { id } of list.messages ?? []) {
    const m = (await gmail(`messages/${id}?format=full`)) as GmailMessage;
    const h = (name: string) => m.payload.headers?.find((x) => x.name.toLowerCase() === name.toLowerCase())?.value ?? null;
    const from = h("From") ?? "";
    const addr = (from.match(/<([^>]+)>/)?.[1] ?? from).trim().toLowerCase();
    const name = from.includes("<") ? from.split("<")[0].replace(/"/g, "").trim() || null : null;
    const auth = (h("Authentication-Results") ?? "").toLowerCase();
    const automated =
      !!h("Auto-Submitted")?.match(/auto-/i) || !!h("List-Unsubscribe") || /bulk|list|junk/i.test(h("Precedence") ?? "") || /(no-?reply|mailer-daemon|postmaster)/i.test(addr);
    out.push({
      gmailId: m.id,
      threadId: m.threadId,
      fromAddress: addr,
      fromName: name,
      subject: h("Subject") ?? "(無主旨)",
      messageId: h("Message-ID"),
      references: h("References"),
      text: stripQuoted(findText(m.payload) ?? m.snippet ?? ""),
      senderVerified: /dkim=pass/.test(auth) || /spf=pass/.test(auth),
      automated,
    });
  }
  return out;
}

export const markEmailRead = (gmailId: string) => gmail(`messages/${gmailId}/modify`, { body: { removeLabelIds: ["UNREAD"] } });

// 主旨要用 MIME encoded-word，中文才不會變亂碼
const encodeHeader = (s: string) => `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`;

export async function sendEmail(opts: { to: string; subject: string; text: string; threadId?: string | null; inReplyTo?: string | null; references?: string | null; automated?: boolean }) {
  const messageId = `<${crypto.randomUUID()}@northweave.mail>`;
  const subject = /^re:/i.test(opts.subject) ? opts.subject : `Re: ${opts.subject}`;
  const headers = [
    `From: ${encodeHeader("北織客服")} <${process.env.GMAIL_ADDRESS}>`,
    `To: ${opts.to}`,
    `Subject: ${encodeHeader(subject)}`,
    `Message-ID: ${messageId}`,
    ...(opts.inReplyTo ? [`In-Reply-To: ${opts.inReplyTo}`, `References: ${[opts.references, opts.inReplyTo].filter(Boolean).join(" ")}`] : []),
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    // AI 回的信標記「自動回覆」，對方的機器人就不會再回我們（人工回覆不加）
    ...(opts.automated ? ["Auto-Submitted: auto-replied"] : []),
  ];
  const raw = headers.join("\r\n") + "\r\n\r\n" + Buffer.from(opts.text, "utf8").toString("base64");
  await gmail("messages/send", { body: { raw: b64urlEncode(raw), ...(opts.threadId && { threadId: opts.threadId }) } });
  return messageId;
}
