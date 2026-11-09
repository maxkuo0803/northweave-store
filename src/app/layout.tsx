import type { Metadata } from "next";
import { Noto_Sans_TC, Permanent_Marker } from "next/font/google";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ChatWidget } from "@/components/chat/ChatWidget";
import { STORE } from "@/lib/store-config";
import "./globals.css";

// 內文與招牌字：思源黑體（招牌用 900 粗體）
const noto = Noto_Sans_TC({ variable: "--font-noto", subsets: ["latin"], weight: ["400", "500", "700", "900"] });
// 吊牌上的編號與價錢：麥克筆手寫感
const marker = Permanent_Marker({ variable: "--font-pm", subsets: ["latin"], weight: "400" });

export const metadata: Metadata = {
  title: { default: `${STORE.name}｜${STORE.tagline}`, template: `%s｜${STORE.shortName}` },
  description: "NORTHWEAVE 北織：台灣小量製作的服飾品牌。（作品集用虛構品牌）",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-Hant-TW" className={`${noto.variable} ${marker.variable} h-full antialiased`}>
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
