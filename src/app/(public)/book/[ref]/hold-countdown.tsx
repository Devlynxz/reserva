"use client";

import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { formatTimeLeft } from "@/lib/display";

// A once-a-second clock for useSyncExternalStore. The server snapshot is null, and React
// uses it for the hydration render too, so the HTML never depends on when it was
// rendered (reading Date.now() during render made server and browser disagree).
let currentSecond: number | null = null;

function subscribe(onChange: () => void) {
  // Fresh on every mount (e.g. after client navigation); React re-reads the snapshot after subscribing.
  currentSecond = Math.floor(Date.now() / 1000);
  const tick = setInterval(() => {
    currentSecond = Math.floor(Date.now() / 1000);
    onChange();
  }, 1000);
  return () => clearInterval(tick);
}

function getSnapshot(): number {
  // Cached so repeated reads within one render agree.
  currentSecond ??= Math.floor(Date.now() / 1000);
  return currentSecond;
}

const getServerSnapshot = (): number | null => null;

/**
 * Time left on a pending hold. While it runs, the page refreshes every few seconds so a
 * confirmation from the payment webhook shows up without the customer reloading.
 */
export function HoldCountdown({ expiresAt }: { expiresAt: string }) {
  const router = useRouter();
  const end = new Date(expiresAt).getTime();
  const second = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    const refresh = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(refresh);
  }, [router]);

  useEffect(() => {
    if (second !== null && second * 1000 >= end) router.refresh();
  }, [second, end, router]);

  return (
    <p className="font-semibold text-ink tabular-nums" role="timer" aria-live="off">
      {/* Until the browser clock is running, a stable placeholder (the page already says until when). */}
      {second === null ? " " : `${formatTimeLeft(end, second * 1000)} left`}
    </p>
  );
}
