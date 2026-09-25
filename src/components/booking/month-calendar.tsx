"use client";

import { useMemo } from "react";
import { cn } from "@/components/ui";
import { addDays, eachDate, localDateOf, weekdayOf } from "@/lib/dates";
import { formatLocalDate, formatMonth } from "@/lib/display";
import type { AvailabilityOption } from "./types";
import type { AvailabilityState } from "./use-availability";
import { AvailabilityError } from "./availability-error";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

/** First and last date of `month`, clipped to the bookable range. */
export function monthRange(month: string, today: string, last: string): { from: string; to: string } {
  const first = `${month}-01`;
  const end = addDays(`${shiftMonth(month, 1)}-01`, -1);
  return { from: first < today ? today : first, to: end > last ? last : end };
}

/**
 * WINDOW mode: one tap per date. A date is open when at least one matching option
 * starts on it (in the business timezone).
 */
export function MonthCalendar({
  month,
  onMonthChange,
  today,
  lastBookableDate,
  timeZone,
  locale,
  availability,
  onRetry,
  resourceFilter,
  selected,
  onSelect,
}: {
  month: string;
  onMonthChange: (month: string) => void;
  today: string;
  lastBookableDate: string;
  timeZone: string;
  locale: string;
  availability: AvailabilityState;
  onRetry: () => void;
  resourceFilter: (option: AvailabilityOption) => boolean;
  selected: string | null;
  onSelect: (date: string) => void;
}) {
  const openDates = useMemo(() => {
    if (availability.status !== "ready") return new Set<string>();
    return new Set(availability.options.filter(resourceFilter).map((o) => localDateOf(new Date(o.startAt), timeZone)));
  }, [availability, resourceFilter, timeZone]);

  const first = `${month}-01`;
  const days = eachDate(first, addDays(`${shiftMonth(month, 1)}-01`, -1));
  const leading = weekdayOf(first);
  const canGoBack = month > monthOf(today);
  const canGoForward = month < monthOf(lastBookableDate);
  const loading = availability.status === "loading";
  const noneOpen = availability.status === "ready" && openDates.size === 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onMonthChange(shiftMonth(month, -1))}
          disabled={!canGoBack}
          className="flex size-11 items-center justify-center rounded-control border border-line text-ink hover:bg-surface-muted disabled:opacity-40"
          aria-label="Previous month"
        >
          <Chevron direction="left" />
        </button>
        <h3 className="text-base font-bold" aria-live="polite">
          {formatMonth(month, locale)}
        </h3>
        <button
          type="button"
          onClick={() => onMonthChange(shiftMonth(month, 1))}
          disabled={!canGoForward}
          className="flex size-11 items-center justify-center rounded-control border border-line text-ink hover:bg-surface-muted disabled:opacity-40"
          aria-label="Next month"
        >
          <Chevron direction="right" />
        </button>
      </div>

      {availability.status === "error" ? (
        <AvailabilityError message={availability.message} onRetry={onRetry} />
      ) : (
        <div aria-busy={loading}>
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-ink-muted" aria-hidden="true">
            {WEEKDAYS.map((d) => (
              <span key={d} className="py-1">
                {d}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: leading }, (_, i) => (
              <span key={`pad-${i}`} aria-hidden="true" />
            ))}
            {days.map((date) => {
              const inRange = date >= today && date <= lastBookableDate;
              const open = inRange && openDates.has(date);
              const isSelected = date === selected;
              return (
                <button
                  key={date}
                  type="button"
                  disabled={!open}
                  onClick={() => onSelect(date)}
                  aria-pressed={isSelected}
                  aria-label={`${formatLocalDate(date, locale)}${open ? "" : ", not available"}`}
                  className={cn(
                    "flex aspect-square min-h-11 items-center justify-center rounded-control text-sm font-semibold tabular-nums transition-colors",
                    loading && inRange && "animate-pulse bg-surface-muted text-ink-muted",
                    !loading && open && !isSelected && "bg-brand-soft text-brand-ink hover:bg-brand hover:text-brand-contrast",
                    !loading && !open && "text-ink-muted/45",
                    isSelected && "bg-brand text-brand-contrast",
                  )}
                >
                  {Number(date.slice(8))}
                </button>
              );
            })}
          </div>
          <p className="mt-3 flex items-center gap-2 text-sm text-ink-muted">
            <span className="inline-block size-3 rounded-sm bg-brand-soft ring-1 ring-brand/30" aria-hidden="true" />
            Open dates
          </p>
          {noneOpen && (
            <p className="mt-2 text-sm text-ink" role="status">
              Nothing open in {formatMonth(month, locale)}.{" "}
              {canGoForward ? (
                <button type="button" className="font-semibold text-brand-ink underline underline-offset-4" onClick={() => onMonthChange(shiftMonth(month, 1))}>
                  Try next month
                </button>
              ) : (
                "Try another package or place."
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden="true">
      <path
        d={direction === "left" ? "m10 3.5-4.5 4.5 4.5 4.5" : "m6 3.5 4.5 4.5L6 12.5"}
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
