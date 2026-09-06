import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Мониторинг серверов AmneziaVPN",
  description: "Read-only мониторинг уже установленных серверов AmneziaWG 3.1",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
