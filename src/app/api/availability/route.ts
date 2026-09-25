import { type NextRequest, NextResponse } from "next/server";
import { availabilityQuerySchema } from "@/lib/validation";
import { getPublicAvailability } from "@/server/data/availability";
import { rateLimit } from "@/server/rate-limit";
import { clientIpFrom } from "@/server/request";

// GET /api/availability?offering=<slug>&from=YYYY-MM-DD&to=YYYY-MM-DD
// Public. Returns free options as { resourceId, startAt, endAt } — never who booked what.

export async function GET(request: NextRequest) {
  const parsed = availabilityQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid query." }, { status: 400 });
  }

  const limit = await rateLimit("availability", clientIpFrom(request.headers));
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many requests." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
    );
  }

  const { offering, from, to } = parsed.data;
  const result = await getPublicAvailability({ offeringSlug: offering, from, to });
  if (!result) return NextResponse.json({ error: "Unknown package." }, { status: 404 });

  return NextResponse.json(
    {
      mode: result.mode,
      options: result.options.map((o) => ({
        resourceId: o.resourceId,
        startAt: o.startAt.toISOString(),
        endAt: o.endAt.toISOString(),
      })),
    },
    // Availability changes with every booking: never serve it from a cache.
    { headers: { "Cache-Control": "no-store" } },
  );
}
