import type { ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-control font-semibold whitespace-nowrap " +
  "transition-colors disabled:pointer-events-none disabled:opacity-50 aria-busy:cursor-progress";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-brand text-brand-contrast hover:bg-brand-hover",
  secondary: "border border-line-strong bg-surface text-ink hover:bg-surface-muted",
  ghost: "text-ink hover:bg-surface-muted",
  danger: "bg-danger text-white hover:opacity-90 dark:text-bg",
};

// Every size keeps a ≥40px hit area; md/lg meet the 44px mobile target.
const sizes: Record<ButtonSize, string> = {
  sm: "h-10 px-3 text-sm",
  md: "h-11 px-4 text-[0.9375rem]",
  lg: "h-13 px-6 text-base",
};

/** For links styled as buttons: `<Link className={buttonStyles()} …>`. */
export function buttonStyles({
  variant = "primary",
  size = "md",
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}): string {
  return cn(base, variants[variant], sizes[size], className);
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner, disables the button and announces the busy state. */
  loading?: boolean;
};

export function Button({
  variant,
  size,
  loading = false,
  disabled,
  className,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonStyles({ variant, size, className })}
      {...props}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn("size-4 animate-spin", className)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
