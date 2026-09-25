import Link from "next/link";
import { buttonStyles } from "@/components/ui";
import { reservaConfig } from "@reserva/config";

// Placeholder landing. Phase 4 replaces it with the full page driven by Settings.content.
export default function HomePage() {
  const { brand } = reservaConfig;
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-6 px-4 py-16 sm:px-6">
      <h1 className="text-4xl font-extrabold sm:text-5xl">{brand.name}</h1>
      <p className="max-w-prose text-lg text-ink-muted">{brand.description}</p>
      <div className="flex flex-wrap gap-3">
        <Link href="/book" className={buttonStyles({ size: "lg" })}>
          Book now
        </Link>
        <Link href="/lookup" className={buttonStyles({ variant: "secondary", size: "lg" })}>
          Find my booking
        </Link>
      </div>
    </main>
  );
}
