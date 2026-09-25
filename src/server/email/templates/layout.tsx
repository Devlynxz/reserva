import { Body, Container, Head, Hr, Html, Link, Preview, Section, Text } from "@react-email/components";
import type { ReactNode } from "react";

// Shared frame for every customer email: the business's brand color as a thin top rule,
// plain type, one primary action. Email clients need inline styles, so no Tailwind here.

export type EmailBrand = {
  businessName: string;
  brandColor: string;
  contact: string | null;
  address: string | null;
};

export const text = { color: "#02272d", fontSize: "15px", lineHeight: "24px", margin: "0 0 12px" } as const;
export const muted = { ...text, color: "#4d6166", fontSize: "14px" } as const;

export function EmailLayout({ brand, preview, children }: { brand: EmailBrand; preview: string; children: ReactNode }) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: "#f3f7f5", fontFamily: "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", margin: 0, padding: "24px 0" }}>
        <Container style={{ backgroundColor: "#ffffff", border: "1px solid #d7e3df", borderRadius: "20px", maxWidth: "560px", overflow: "hidden" }}>
          <Section style={{ backgroundColor: brand.brandColor, height: "6px" }} />
          <Section style={{ padding: "28px 32px 8px" }}>
            <Text style={{ ...muted, fontWeight: 600, margin: "0 0 20px" }}>{brand.businessName}</Text>
            {children}
          </Section>
          <Hr style={{ borderColor: "#d7e3df", margin: "8px 0 0" }} />
          <Section style={{ padding: "16px 32px 24px" }}>
            <Text style={{ ...muted, fontSize: "13px", margin: 0 }}>
              {brand.businessName}
              {brand.address ? `, ${brand.address}` : ""}
            </Text>
            {brand.contact && <Text style={{ ...muted, fontSize: "13px", margin: "4px 0 0" }}>Questions? Reply to this email or contact {brand.contact}.</Text>}
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export function PrimaryButton({ href, color, textColor, children }: { href: string; color: string; textColor: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      style={{
        backgroundColor: color,
        borderRadius: "10px",
        color: textColor,
        display: "inline-block",
        fontSize: "15px",
        fontWeight: 700,
        margin: "8px 0 20px",
        padding: "12px 20px",
        textDecoration: "none",
      }}
    >
      {children}
    </Link>
  );
}

export type DetailRow = { label: string; value: string };

export function Details({ rows }: { rows: DetailRow[] }) {
  return (
    <Section style={{ backgroundColor: "#f3f7f5", borderRadius: "12px", margin: "8px 0 20px", padding: "16px 20px" }}>
      {rows.map((row) => (
        <Text key={row.label} style={{ ...text, margin: "0 0 8px" }}>
          <span style={{ color: "#4d6166", display: "block", fontSize: "13px" }}>{row.label}</span>
          <strong>{row.value}</strong>
        </Text>
      ))}
    </Section>
  );
}
