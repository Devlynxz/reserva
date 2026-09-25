import { ImageResponse } from "next/og";
import { normalizeHex, readableTextOn } from "@/lib/color";
import { getSettingsOrNull } from "@/server/data/settings";
import { reservaConfig } from "@reserva/config";

export const alt = "Book online";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
// Reads the business's name and colors from the database at request time.
export const dynamic = "force-dynamic";

export default async function OpenGraphImage() {
  const settings = await getSettingsOrNull();
  const name = settings?.businessName ?? reservaConfig.brand.name;
  const line = settings?.tagline ?? reservaConfig.brand.tagline;
  const brand = normalizeHex(settings?.brandColor ?? "") ?? reservaConfig.brand.color;
  const ink = readableTextOn(brand);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: brand,
          color: ink,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 30, fontWeight: 600, opacity: 0.85 }}>Book online</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", fontSize: 84, fontWeight: 800, lineHeight: 1.02, letterSpacing: -2 }}>{name}</div>
          <div style={{ display: "flex", fontSize: 38, opacity: 0.9 }}>{line}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 28 }}>
          <div style={{ display: "flex", width: 44, height: 4, background: ink, borderRadius: 2 }} />
          See open dates and pay your deposit in minutes
        </div>
      </div>
    ),
    size,
  );
}
