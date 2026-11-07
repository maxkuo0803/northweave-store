import type { Metadata } from "next";
import { Noto_Sans_TC } from "next/font/google";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { STORE } from "@/lib/store-config";
import "./globals.css";

const noto = Noto_Sans_TC({ variable: "--font-noto", subsets: ["latin"], weight: ["400", "500", "700"] });

export const metadata: Metadata = {
  title: { default: `${STORE.name}｜${STORE.tagline}`, template: `%s｜${STORE.shortName}` },
  description: "NORTHWEAVE 北織：日常好穿的服飾基本款。（作品集用虛構品牌）",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-Hant-TW" className={`${noto.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
