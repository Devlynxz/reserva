import { beforeEach, expect, it } from "vitest";
import { consumeRateLimit, pruneRateLimits } from "@/server/data/rate-limit";
import { NOW, db, describeDb, resetDb } from "@/test/db";

const LIMIT = { limit: 3, windowSec: 60 };
const plus = (seconds: number) => new Date(NOW.getTime() + seconds * 1000);

describeDb("consumeRateLimit", () => {
  beforeEach(resetDb);

  it("allows up to the limit, then refuses with a retry-after", async () => {
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await consumeRateLimit("lookup:ip:1", LIMIT, plus(i)));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results.map((r) => r.remaining)).toEqual([2, 1, 0, 0]);
    expect(results[3]!.retryAfterSec).toBe(57);
  });

  it("starts a fresh window once the old one ends", async () => {
    for (let i = 0; i < 4; i++) await consumeRateLimit("k", LIMIT, NOW);
    expect((await consumeRateLimit("k", LIMIT, plus(60))).allowed).toBe(true);
  });

  it("counts keys separately and atomically under concurrency", async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => consumeRateLimit("burst", LIMIT, NOW)));
    expect(results.filter((r) => r.allowed)).toHaveLength(3);
    expect((await consumeRateLimit("other", LIMIT, NOW)).allowed).toBe(true);
  });

  it("prunes finished windows", async () => {
    await consumeRateLimit("old", LIMIT, NOW);
    await consumeRateLimit("new", LIMIT, plus(120));
    expect(await pruneRateLimits(plus(60))).toBe(1);
    expect(await db.rateLimit.findMany({ select: { key: true } })).toEqual([{ key: "new" }]);
  });
});
