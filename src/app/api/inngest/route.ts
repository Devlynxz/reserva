import { serve } from "inngest/next";
import { inngest } from "@/server/inngest/client";
import { functions } from "@/server/inngest/functions";

// Inngest calls this endpoint to discover and run the cron functions. Requests are signed
// with INNGEST_SIGNING_KEY in production (the SDK verifies them).
export const { GET, POST, PUT } = serve({ client: inngest, functions });
