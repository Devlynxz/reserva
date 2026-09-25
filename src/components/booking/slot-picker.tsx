"use client";

import { useMemo } from "react";
import { cn } from "@/components/ui";
import { addDays, eachDate, formatTime, localDateOf, localMinuteOf } from "@/lib/dates";
import { formatLocalDate, formatMinuteOfDay } from "@/lib/display";
import { AvailabilityError } from "./availability-error";
import { Chevron } from "./month-calendar";
import type { AvailabilityOption } from "./types";
import type { AvailabilityState } from "./use-availability";

export const SLOT_PAGE_DAYS = 7;

/**
 * SLOT mode: a week of days, then the open start times on the chosen day.
 * Times are shown and submitted in the business's local time ("HH:mm").
 */
export function SlotPicker({
  pageStart,
  onPageChange,
  today,
  lastBookableDate,
  timeZone,
  locale,
  availability,
  onRetry,
  resourceFilter,
  date,
  time,
  onSelectDate,
  onSelectTime,
}: {
  pageStart: string;
  onPageChange: (start: string) => void;
  today: string;
  lastBookableDate: string;
  timeZone: string;
  locale: string;
  availability: AvailabilityState;
  onRetry: () => void;
  resourceFilter: (option: AvailabilityOption) => boolean;
  date: string | null;
  time: string | null;
  onSelectDate: (date: string) => void;
  onSelectTime: (time: string) => void;
}) {
  const pageEnd = [addDays(pageStart, SLOT_PAGE_DAYS - 1), lastBookableDate].sort()[0]!;
  const days = eachDate(pageStart, pageEnd);

  /** date → sorted unique local start minutes. */
  const timesByDate = useMemo(() => {
    const map = new Map<string, Set<number>>();
    if (availability.status !== "ready") return map;
    for (const option of availability.options.filter(resourceFilter)) {
      const start = new Date(option.startAt);
      const key = localDateOf(start, timeZone);
      if (!map.has(key)) map.set(key, new Set());
      map.get(key)!.add(localMinuteOf(start, timeZone));
    }
    return map;
  }, [availability, resourceFilter, timeZone]);

  const loading = availability.status === "loading";
  const times = date ? [...(timesByDate.get(date) ?? [])].sort((a, b) => a - b) : [];

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => onPageChange([addDays(pageStart, -SLOT_PAGE_DAYS), today].sort().at(-1)!)}
            disabled={pageStart <= today}
            className="flex size-11 shrink-0 items-center justify-center rounded-control border border-line hover:bg-surface-muted disabled:opacity-40"
            aria-label="Earlier days"
          >
            <Chevron direction="left" />
          </button>
          <p className="text-sm font-semibold tabular-nums" aria-live="polite">
            {formatLocalDate(pageStart, locale, "short")} to {formatLocalDate(pageEnd, locale, "short")}
          </p>
          <button
            type="button"
            onClick={() => onPageChange(addDays(pageStart, SLOT_PAGE_DAYS))}
            disabled={pageEnd >= lastBookableDate}
            className="flex size-11 shrink-0 items-center justify-center rounded-control border border-line hover:bg-surface-muted disabled:opacity-40"
            aria-label="Later days"
          >
            <Chevron direction="right" />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1" role="group" aria-label="Choose a day">
          {days.map((d) => {
            const open = (timesByDate.get(d)?.size ?? 0) > 0;
            const selected = d === date;
            return (
              <button
                key={d}
                type="button"
                disabled={!open}
                onClick={() => onSelectDate(d)}
                aria-pressed={selected}
                aria-label={`${formatLocalDate(d, locale)}${open ? "" : ", no times left"}`}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center rounded-control text-xs transition-colors",
                  loading && "animate-pulse bg-surface-muted text-ink-muted",
                  !loading && open && !selected && "bg-brand-soft text-brand-ink hover:bg-brand hover:text-brand-contrast",
                  !loading && !open && "text-ink-muted/45",
                  selected && "bg-brand text-brand-contrast",
                )}
              >
                <span className="font-medium">{formatLocalDate(d, locale, "short").split(",")[0]}</span>
                <span className="text-base font-bold tabular-nums">{Number(d.slice(8))}</span>
              </button>
            );
          })}
        </div>
      </div>

      {availability.status === "error" ? (
        <AvailabilityError message={availability.message} onRetry={onRetry} />
      ) : !date ? (
        <p className="text-sm text-ink-muted">
          {!loading && timesByDate.size === 0 ? "No times left this week. Try later days." : "Pick a day to see open times."}
        </p>
      ) : (
        <fieldset>
          <legend className="mb-3 text-sm font-semibold">{formatLocalDate(date, locale)}</legend>
          {times.length === 0 ? (
            <p className="text-sm text-ink-muted">{loading ? "Loading times…" : "No times left on this day."}</p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
              {times.map((minute) => {
                const value = formatTime(minute);
                const selected = value === time;
                return (
                  <button
                    key={minute}
                    type="button"
                    onClick={() => onSelectTime(value)}
                    aria-pressed={selected}
                    className={cn(
                      "min-h-11 rounded-control border text-sm font-semibold tabular-nums transition-colors",
                      selected ? "border-brand bg-brand text-brand-contrast" : "border-line-strong bg-surface hover:border-brand hover:text-brand-ink",
                    )}
                  >
                    {formatMinuteOfDay(minute, locale)}
                  </button>
                );
              })}
            </div>
          )}
        </fieldset>
      )}
    </div>
  );
}
