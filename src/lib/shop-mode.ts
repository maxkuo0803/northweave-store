import { cookies } from "next/headers";
import type { ShopMode } from "@/components/chat/XiaozhiProvider";

// 逛街模式：存在 cookie（伺服器渲染時就知道，不會先閃一下別的版本）
// - concierge（預設）：首頁就是小織，用聊的逛
// - browse：傳統首頁，自己逛
export const SHOP_MODE_COOKIE = "nw_mode";

export async function getShopMode(): Promise<ShopMode> {
  return (await cookies()).get(SHOP_MODE_COOKIE)?.value === "browse" ? "browse" : "concierge";
}
