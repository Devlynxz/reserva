import type { Metadata, Viewport } from "next";
import { Figtree } from "next/font/google";
import { headers } from "next/headers";
import { DemoBanner } from "@/components/demo-banner";
import { brandCssVars } from "@/lib/color";
import { getSettingsOrNull } from "@/server/data/settings";
import { reservaConfig } from "@reserva/config";
import "./globals.css";

const figtree = Figtree({ subsets: ["latin"], variable: "--font-figtree", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSettingsOrNull();
  const name = settings?.businessName ?? reservaConfig.brand.name;
  const description = settings?.content.hero?.subhead ?? settings?.tagline ?? reservaConfig.brand.description;
  return {
    metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
    title: { default: name, template: `%s | ${name}` },
    description,
    applicationName: name,
    openGraph: { type: "website", siteName: name, title: name, description, locale: reservaConfig.locale.replace("-", "_") },
    twitter: { card: "summary_large_image", title: name, description },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0c141e" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Set by src/proxy.ts. Reading headers makes every page dynamic, which the CSP nonce requires.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const settings = await getSettingsOrNull();
  const brand = brandCssVars(settings?.brandColor ?? reservaConfig.brand.color, reservaConfig.brand.color);

  return (
    <html lang="en" className={figtree.variable}>
      <head>
        <style nonce={nonce}>{`:root{${brand}}`}</style>
      </head>
      <body className="min-h-dvh antialiased">
        {/* First tab stop on every page. Public and admin layouts both mark their content #main. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-control focus:bg-surface focus:px-3 focus:py-2 focus:text-ink"
        >
          Skip to content
        </a>
        <DemoBanner />
        {children}
      </body>
    </html>
  );
}
