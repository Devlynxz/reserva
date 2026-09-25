import type { MetadataRoute } from "next";
import { getSettingsOrNull } from "@/server/data/settings";
import { reservaConfig } from "@reserva/config";

// Install metadata ("Add to home screen"), named after the business.
// Read at request time: the name can change in Settings after the build.
export const dynamic = "force-dynamic";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const settings = await getSettingsOrNull();
  const name = settings?.businessName ?? reservaConfig.brand.name;
  return {
    name,
    short_name: name,
    description: settings?.tagline ?? reservaConfig.brand.tagline,
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#02272d",
    icons: [
      { src: "/brand/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/brand/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
