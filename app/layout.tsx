import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "./concept-d.css";
import "./home-override.css";
import "./create-project.css";
import "./account-dashboard-concept-d.css";

const cormorantGaramond = localFont({
  src: [
    { path: "./fonts/cormorant-garamond-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/cormorant-garamond-500.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-cormorant-garamond",
  display: "swap",
  fallback: ["Georgia", "Times New Roman"],
});

const manrope = localFont({
  src: [
    { path: "./fonts/manrope-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/manrope-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/manrope-600.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-manrope",
  display: "swap",
  fallback: ["Helvetica Neue", "Arial"],
});

export const metadata: Metadata = {
  title: "ROOM design — ИИ-платформа для дизайнеров интерьера",
  description: "Визуализируйте мебель в интерьерных проектах с помощью ИИ.",
  openGraph: {
    title: "ROOM design — ИИ-платформа для дизайнеров интерьера",
    description: "Визуализируйте мебель в интерьерных проектах с помощью ИИ.",
  },
  twitter: {
    card: "summary_large_image",
    title: "ROOM design — ИИ-платформа для дизайнеров интерьера",
    description: "Визуализируйте мебель в интерьерных проектах с помощью ИИ.",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className={`${cormorantGaramond.variable} ${manrope.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
