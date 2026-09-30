import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import localFont from "next/font/local";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { PwaRegister } from "@/components/pwa/PwaRegister";
import { Toaster } from "@/components/ui/toast";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

const satoshi = localFont({
  src: [
    { path: "../fonts/Satoshi-500.woff2", weight: "500", style: "normal" },
    { path: "../fonts/Satoshi-700.woff2", weight: "700", style: "normal" },
    { path: "../fonts/Satoshi-900.woff2", weight: "900", style: "normal" },
  ],
  variable: "--font-satoshi",
  display: "swap",
});

// Absolute base for link-preview images (WhatsApp needs full URLs). Override with NEXT_PUBLIC_SITE_URL for a custom domain.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://chinainghana.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "China-in-Ghana · Home appliances at wholesale prices",
    template: "%s · China-in-Ghana",
  },
  description: "Browse live prices and stock at your nearest China-in-Ghana branch and order on WhatsApp.",
  applicationName: "China-in-Ghana",
  openGraph: {
    title: "China-in-Ghana · Home appliances at wholesale prices",
    description: "Live prices and stock at your nearest branch. Order on WhatsApp.",
    siteName: "China-in-Ghana",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
  appleWebApp: { capable: true, title: "China-in-Ghana", statusBarStyle: "black-translucent" },
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }], apple: "/icons/apple-touch-icon.png" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#0b1b3f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${satoshi.variable}`}>
      <body className="min-h-dvh antialiased">
        <AuthProvider>
          {children}
          <Toaster />
          <PwaRegister />
        </AuthProvider>
      </body>
    </html>
  );
}
