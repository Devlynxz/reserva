import "server-only";
import { db } from "./db";

// DB-backed fixed-window rate limiter (works across serverless instances, no Redis).
// One atomic upsert per call: the row either starts a new window or bumps the count.

export type RateLimitResult = { allowed: boolean; remaining: number; retryAfterSec: number };

export async function consumeRateLimit(
  key: string,
  { limit, windowSec }: { limit: number; windowSec: number },
  now = new Date(),
): Promise<RateLimitResult> {
  const windowStartCutoff = new Date(now.getTime() - windowSec * 1000);
  const [row] = await db.$queryRaw<Array<{ count: number; window_start: Date }>>`
    INSERT INTO rate_limits (key, count, window_start)
    VALUES (${key}, 1, ${now})
    ON CONFLICT (key) DO UPDATE SET
      count        = CASE WHEN rate_limits.window_start <= ${windowStartCutoff} THEN 1 ELSE rate_limits.count + 1 END,
      window_start = CASE WHEN rate_limits.window_start <= ${windowStartCutoff} THEN ${now} ELSE rate_limits.window_start END
    RETURNING count, window_start`;
  const count = row!.count;
  const resetAt = row!.window_start.getTime() + windowSec * 1000;
  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    retryAfterSec: count <= limit ? 0 : Math.max(1, Math.ceil((resetAt - now.getTime()) / 1000)),
  };
}

/** Housekeeping (Inngest): drop windows that ended before `before`. */
export async function pruneRateLimits(before: Date): Promise<number> {
  const { count } = await db.rateLimit.deleteMany({ where: { windowStart: { lt: before } } });
  return count;
}
