import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "./concept-d.css";
import "./home-override.css";
import "./create-project.css";
import "./account-dashboard-concept-d.css";
import "./studio-preview-iteration.css";
import "./it-orb.css";
import "./templates-foundation.css";
import "./templates-home-v2.css";

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
  manifest: "/site.webmanifest?v=editorial-r-1",
  icons: {
    icon: [
      {
        url: "/favicon.svg?v=editorial-r-1",
        type: "image/svg+xml",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/favicon-dark.svg?v=editorial-r-1",
        type: "image/svg+xml",
        media: "(prefers-color-scheme: dark)",
      },
      { url: "/favicon.ico?v=editorial-r-1", sizes: "any" },
      { url: "/favicon-32x32.png?v=editorial-r-1", type: "image/png", sizes: "32x32" },
      { url: "/favicon-16x16.png?v=editorial-r-1", type: "image/png", sizes: "16x16" },
    ],
    shortcut: "/favicon.ico?v=editorial-r-1",
    apple: {
      url: "/apple-touch-icon.png?v=editorial-r-1",
      type: "image/png",
      sizes: "180x180",
    },
    other: {
      rel: "mask-icon",
      url: "/safari-pinned-tab.svg?v=editorial-r-1",
      color: "#6E242A",
    },
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
