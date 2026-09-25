import Image from "next/image";
import { cn } from "@/components/ui";

// The Reserva product brand (from the brand kit). Client sites show the client's own name
// and logo from Settings; the Reserva marks appear where the product itself is speaking:
// the admin, staff sign-in and the "Powered by" line.
//
// Each logo has a colored version for light surfaces and a white one for dark surfaces;
// both are rendered and the theme picks one, so there's no flash on load.

const LOGOS = {
  mark: { light: "/brand/reserva-mark.png", dark: "/brand/reserva-mark-white.png", width: 370, height: 438 },
  lockup: {
    light: "/brand/reserva-lockup-horizontal.png",
    dark: "/brand/reserva-lockup-horizontal-white.png",
    width: 878,
    height: 260,
  },
} as const;

/**
 * The Reserva logo at a fixed height (the width follows). Decorative by default; pass
 * `label` when the logo is the only name for a link or heading.
 */
export function ReservaLogo({
  variant = "lockup",
  height,
  label,
  className,
}: {
  variant?: keyof typeof LOGOS;
  height: number;
  label?: string;
  className?: string;
}) {
  const logo = LOGOS[variant];
  const width = Math.round((logo.width / logo.height) * height);
  const common = { width, height } as const;
  // The name sits on the wrapper: whichever copy the theme hides, it's announced once.
  return (
    <span role={label ? "img" : undefined} aria-label={label} className={cn("inline-flex shrink-0", className)}>
      <Image src={logo.light} alt="" {...common} className="dark:hidden" />
      <Image src={logo.dark} alt="" {...common} className="hidden dark:block" />
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
