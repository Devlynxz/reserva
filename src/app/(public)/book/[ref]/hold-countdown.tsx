"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Time left on a pending hold. While it runs, the page refreshes every few seconds so a
 * confirmation from the payment webhook shows up without the customer reloading.
 */
export function HoldCountdown({ expiresAt }: { expiresAt: string }) {
  const router = useRouter();
  const end = new Date(expiresAt).getTime();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const refresh = setInterval(() => router.refresh(), 5000);
    return () => {
      clearInterval(tick);
      clearInterval(refresh);
    };
  }, [router]);

  useEffect(() => {
    if (now >= end) router.refresh();
  }, [now, end, router]);

  const left = Math.max(0, Math.round((end - now) / 1000));
  const minutes = Math.floor(left / 60);
  const seconds = String(left % 60).padStart(2, "0");
  return (
    <p className="font-semibold text-ink tabular-nums" role="timer" aria-live="off">
      {minutes}:{seconds} left
    </p>
  );
}
