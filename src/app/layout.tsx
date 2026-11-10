import type { Metadata } from "next";
import { IBM_Plex_Mono, Noto_Sans_TC, Noto_Serif_TC } from "next/font/google";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ChatWidget } from "@/components/chat/ChatWidget";
import { XiaozhiProvider } from "@/components/chat/XiaozhiProvider";
import { getShopMode } from "@/lib/shop-mode";
import { STORE } from "@/lib/store-config";
import "./globals.css";

// 內文：思源黑體
const noto = Noto_Sans_TC({ variable: "--font-noto", subsets: ["latin"], weight: ["400", "500", "700", "900"] });
// 標題：思源宋體（明體），像老店招牌
const notoSerif = Noto_Serif_TC({ variable: "--font-noto-serif", subsets: ["latin"], weight: ["700", "900"] });
// 編號、價錢：等寬字，像統一發票
const mono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["500", "600"] });

export const metadata: Metadata = {
  title: { default: `${STORE.name}｜${STORE.tagline}`, template: `%s｜${STORE.shortName}` },
  description: "NORTHWEAVE 北織：台灣小量製作的服飾品牌。（作品集用虛構品牌）",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const mode = await getShopMode();
  // AI 回覆裡的網址用的網域，用來判斷是不是站內連結
  const siteOrigin = new URL(process.env.BETTER_AUTH_URL || "http://localhost:3000").origin;
  return (
    <html lang="zh-Hant-TW" className={`${noto.variable} ${notoSerif.variable} ${mono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        {/* 小織（AI 店員）的對話狀態整站共用：首頁舞台、浮動小織都看同一串對話 */}
        <XiaozhiProvider mode={mode} siteOrigin={siteOrigin}>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
          {/* 浮動小織（後台、首頁舞台不顯示） */}
          <ChatWidget />
        </XiaozhiProvider>
      </body>
    </html>
  );
}
