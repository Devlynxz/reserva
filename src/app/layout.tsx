import type { Metadata, Viewport } from "next";
import { Figtree } from "next/font/google";
import { headers } from "next/headers";
import { brandCssVars } from "@/lib/color";
import { reservaConfig } from "@reserva/config";
import "./globals.css";

const figtree = Figtree({ subsets: ["latin"], variable: "--font-figtree", display: "swap" });

export const metadata: Metadata = {
  title: { default: reservaConfig.brand.name, template: `%s · ${reservaConfig.brand.name}` },
  description: reservaConfig.brand.description,
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0c141e" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Set by src/proxy.ts. Reading headers makes every page dynamic, which the CSP nonce requires.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  // Phase 3: read Settings.brandColor here; the config color is the fallback.
  const brand = brandCssVars(reservaConfig.brand.color, reservaConfig.brand.color);

  return (
    <html lang="en" className={figtree.variable}>
      <head>
        <style nonce={nonce}>{`:root{${brand}}`}</style>
      </head>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
