// 只允許站內相對路徑，避免 ?next=https://evil.com 這種「開放式重新導向」漏洞
export function safePath(value: unknown, fallback = "/account") {
  const v = typeof value === "string" ? value : "";
  return v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\") ? v : fallback;
}

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
