import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nauli SaKo",
  description: "Pay your matatu fare with M-Pesa. Lipa nauli kwa M-Pesa.",
  applicationName: "Nauli SaKo",
  appleWebApp: { capable: true, title: "Nauli", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#facc15",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
