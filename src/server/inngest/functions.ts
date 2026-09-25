import "server-only";
import { sweepExpiredHolds } from "../data/bookings";
import { pruneRateLimits } from "../data/rate-limit";
import { sendDueReminders } from "../notifications";
import { inngest } from "./client";

/** Backstop for lazy hold expiry: every 5 minutes, release holds nobody paid for. */
export const sweepHolds = inngest.createFunction(
  { id: "sweep-expired-holds", triggers: { cron: "*/5 * * * *" } },
  async ({ step }) => step.run("expire-stale-holds", async () => ({ expired: await sweepExpiredHolds() })),
);

/**
 * Hourly tick; sendDueReminders acts only when it's 09:00 in the business's timezone (read
 * from Settings at run time, so a timezone change needs no redeploy).
 */
export const sendReminders = inngest.createFunction(
  { id: "send-booking-reminders", triggers: { cron: "0 * * * *" } },
  async ({ step }) => step.run("send-due-reminders", () => sendDueReminders()),
);

/** Daily housekeeping for the DB-backed rate limiter. */
export const pruneRateLimitWindows = inngest.createFunction(
  { id: "prune-rate-limits", triggers: { cron: "30 3 * * *" } },
  async ({ step }) =>
    step.run("prune", async () => ({ deleted: await pruneRateLimits(new Date(Date.now() - 24 * 60 * 60 * 1000)) })),
);

export const functions = [sweepHolds, sendReminders, pruneRateLimitWindows];
