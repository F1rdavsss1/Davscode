import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, JetBrains_Mono, Manrope, Unbounded } from "next/font/google";
import { site } from "@/config/site";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Attribution } from "@/components/Attribution";
import { Metrika } from "@/components/Metrika";
import { MobileCta } from "@/components/MobileCta";
import { Reveal } from "@/components/Reveal";
import "./globals.css";

// Заголовки (ТЗ 3.3).
const unbounded = Unbounded({
  subsets: ["latin", "cyrillic"],
  weight: ["500", "600", "700"],
  variable: "--font-unbounded",
  display: "swap",
});
// Основной текст.
const manrope = Manrope({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-manrope",
  display: "swap",
});
// Акцентные слова.
const cormorant = Cormorant_Garamond({
  subsets: ["latin", "cyrillic"],
  weight: ["400"],
  style: ["italic"],
  variable: "--font-cormorant",
  display: "swap",
});
// Подписи, номера, метаданные.
const jetbrains = JetBrains_Mono({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: "DavsCode — сайты и Telegram-боты для малого бизнеса", template: "%s — DavsCode" },
  description: site.description,
  applicationName: "DavsCode",
  openGraph: { type: "website", locale: site.locale, siteName: "DavsCode", url: site.url },
  twitter: { card: "summary_large_image" },
  formatDetection: { telephone: false },
  appleWebApp: { title: "DavsCode", statusBarStyle: "black-translucent", capable: true },
};

// viewport-fit=cover — контент под вырезом/Dynamic Island, отступы задаёт env(safe-area-inset-*).
export const viewport: Viewport = {
  themeColor: "#1C1C1E",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${unbounded.variable} ${manrope.variable} ${cormorant.variable} ${jetbrains.variable}`}>
      <body>
        <a href="#main" className="skip-link">
          Перейти к содержанию
        </a>
        <Header />
        <main id="main">{children}</main>
        <Footer />
        <MobileCta />
        <Reveal />
        <Attribution />
        <Metrika />
      </body>
    </html>
  );
}
