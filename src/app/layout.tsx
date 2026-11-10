import type { Metadata } from "next";
import { IBM_Plex_Mono, Noto_Sans_TC, Noto_Serif_TC } from "next/font/google";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ChatWidget } from "@/components/chat/ChatWidget";
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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-Hant-TW" className={`${noto.variable} ${notoSerif.variable} ${mono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
        {/* AI 客服聊天視窗（後台不顯示） */}
        <ChatWidget siteOrigin={new URL(process.env.BETTER_AUTH_URL || "http://localhost:3000").origin} />
      </body>
    </html>
  );
}
