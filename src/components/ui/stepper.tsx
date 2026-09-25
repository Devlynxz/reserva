import { cn } from "./cn";

export type Step = { id: string; label: string };

/**
 * Progress through the booking flow. The steps are a real sequence, so they're numbered.
 * On narrow screens only the current step's label is shown; the others stay available
 * to screen readers.
 */
export function Stepper({
  steps,
  current,
  label = "Booking progress",
  className,
}: {
  steps: readonly Step[];
  /** Index of the active step (0-based). */
  current: number;
  label?: string;
  className?: string;
}) {
  return (
    <nav aria-label={label} className={className}>
      <p className="mb-3 text-sm text-ink-muted sm:sr-only">
        Step {current + 1} of {steps.length}
      </p>
      <ol className="flex items-center gap-2">
        {steps.map((step, index) => {
          const state = index < current ? "done" : index === current ? "current" : "upcoming";
          return (
            <li key={step.id} className={cn("flex items-center gap-2", index < steps.length - 1 && "flex-1")}>
              <span
                aria-current={state === "current" ? "step" : undefined}
                className="flex shrink-0 items-center gap-2"
              >
                <span
                  className={cn(
                    "flex size-8 items-center justify-center rounded-full border-2 text-sm font-bold tabular-nums",
                    state === "done" && "border-brand bg-brand text-brand-contrast",
                    state === "current" && "border-brand bg-brand-soft text-brand-ink",
                    state === "upcoming" && "border-line-strong text-ink-muted",
                  )}
                >
                  {state === "done" ? <Check /> : index + 1}
                </span>
                <span
                  className={cn(
                    "text-sm font-semibold whitespace-nowrap",
                    state === "current" ? "text-ink" : "sr-only text-ink-muted sm:not-sr-only",
                  )}
                >
                  {step.label}
                  {state === "done" && <span className="sr-only"> (completed)</span>}
                </span>
              </span>
              {index < steps.length - 1 && (
                <span
                  aria-hidden="true"
                  className={cn("h-0.5 min-w-4 flex-1 rounded-full", index < current ? "bg-brand" : "bg-line")}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function Check() {
  return (
    <svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden="true">
      <path d="m3.5 8.5 3 3 6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
