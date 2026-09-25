import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/server/auth";

// Resolve the auth instance per request (see getAuth) rather than at import time.
export const GET = (request: Request) => toNextJsHandler(getAuth()).GET(request);
export const POST = (request: Request) => toNextJsHandler(getAuth()).POST(request);
