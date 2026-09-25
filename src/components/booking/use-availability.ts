"use client";

import { useCallback, useEffect, useState } from "react";
import type { AvailabilityOption } from "./types";

export type AvailabilityState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; options: AvailabilityOption[] };

const LOADING: AvailabilityState = { status: "loading" };

/**
 * Free options for an offering between two local dates, refetched when the range changes.
 * Results are keyed by request, so a new range reads as "loading" until its own answer
 * arrives — a slow response for an old month can never show under a new one.
 */
export function useAvailability(offering: string | null, from: string, to: string) {
  const [attempt, setAttempt] = useState(0);
  const key = `${offering}|${from}|${to}|${attempt}`;
  const [result, setResult] = useState<{ key: string; state: AvailabilityState } | null>(null);

  useEffect(() => {
    if (!offering || from > to) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ offering, from, to });
    fetch(`/api/availability?${query}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as { options?: AvailabilityOption[]; error?: string };
        if (!response.ok || !body.options) {
          throw new Error(
            response.status === 429 ? "Too many requests. Wait a moment, then try again." : (body.error ?? "Couldn't load open times."),
          );
        }
        setResult({ key, state: { status: "ready", options: body.options } });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setResult({ key, state: { status: "error", message: error instanceof Error ? error.message : "Couldn't load open times." } });
      });
    return () => controller.abort();
  }, [key, offering, from, to]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { state: result?.key === key ? result.state : LOADING, retry };
}
