import type { Metadata } from "next";
import "./globals.css";
import "./home-override.css";

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
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
