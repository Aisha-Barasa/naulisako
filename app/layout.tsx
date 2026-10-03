import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { DISPLAY_BOOT_SCRIPT } from "@/lib/preferences";

// Self-hosted (no runtime request to Google): plates, amounts and headings only.
const display = localFont({
  src: [
    { path: "./fonts/BarlowCondensed-600.woff2", weight: "600" },
    { path: "./fonts/BarlowCondensed-800.woff2", weight: "800" },
  ],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Nauli SaKo",
  description: "Pay your matatu fare with M-Pesa. Lipa nauli kwa M-Pesa.",
  applicationName: "Nauli SaKo",
  appleWebApp: { capable: true, title: "Nauli", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={display.variable} suppressHydrationWarning>
      <head>
        {/* Apply larger text / high contrast before first paint. */}
        <script dangerouslySetInnerHTML={{ __html: DISPLAY_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-dvh">
        <a
          href="#content"
          className="sr-only z-50 rounded-xl bg-ink px-4 py-3 font-bold text-white focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
        >
          Skip to content
        </a>
        <div id="content" tabIndex={-1} className="outline-none">
          {children}
        </div>
      </body>
    </html>
  );
}
