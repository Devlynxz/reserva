import Image from "next/image";
import { cn } from "@/components/ui";

// The Reserva product brand, shown only as the optional "Powered by Reserva" line. Everything
// else on a deployment shows the business's own brand (see BusinessBrand).

const LOCKUP = {
  light: "/brand/reserva-lockup-horizontal.png",
  dark: "/brand/reserva-lockup-horizontal-white.png",
  width: 878,
  height: 260,
} as const;

/** The Reserva lockup at a fixed height (the width follows). Decorative unless `label` is given. */
export function ReservaLogo({ height, label, className }: { height: number; label?: string; className?: string }) {
  const width = Math.round((LOCKUP.width / LOCKUP.height) * height);
  // The name sits on the wrapper: whichever copy the theme hides, it's announced once.
  return (
    <span role={label ? "img" : undefined} aria-label={label} className={cn("inline-flex shrink-0", className)}>
      <Image src={LOCKUP.light} alt="" width={width} height={height} className="dark:hidden" />
      <Image src={LOCKUP.dark} alt="" width={width} height={height} className="hidden dark:block" />
    </span>
  );
}

export function PoweredByReserva({ className }: { className?: string }) {
  return (
    <a
      href="https://github.com/Devlynxz/reserva"
      target="_blank"
      rel="noopener noreferrer"
      className={cn("inline-flex items-center gap-1.5 text-xs font-medium text-ink-muted hover:text-ink", className)}
    >
      Powered by
      <ReservaLogo height={20} label="Reserva" />
    </a>
  );
}
