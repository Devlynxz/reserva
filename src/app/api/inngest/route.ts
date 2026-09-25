import { serve } from "inngest/next";
import { type NextRequest, NextResponse } from "next/server";
import { inngest } from "@/server/inngest/client";
import { functions } from "@/server/inngest/functions";

// Inngest calls this endpoint to discover and run the cron functions. In production the
// SDK only accepts requests signed with INNGEST_SIGNING_KEY (set by the Vercel
// integration). Without it, answer 503 with a clear reason instead of an opaque 500: the
// app itself works fine without jobs (holds still expire lazily).

const handler = serve({ client: inngest, functions });

function notConnected() {
  return NextResponse.json(
    { error: "Background jobs aren't connected. Add the Inngest integration (it sets INNGEST_SIGNING_KEY)." },
    { status: 503 },
  );
}

const connected = () => process.env.NODE_ENV !== "production" || Boolean(process.env.INNGEST_SIGNING_KEY);

export const GET = (request: NextRequest, context: unknown) => (connected() ? handler.GET(request, context) : notConnected());
export const POST = (request: NextRequest, context: unknown) => (connected() ? handler.POST(request, context) : notConnected());
export const PUT = (request: NextRequest, context: unknown) => (connected() ? handler.PUT(request, context) : notConnected());
