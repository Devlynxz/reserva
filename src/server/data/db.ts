import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { createPrismaClient } from "./client";

// The only PrismaClient. Everything that touches the database lives in src/server/data/*.
// Runtime uses the POOLED url; migrations use the direct one (prisma.config.ts).
// Construction doesn't connect, so importing this during `next build` is safe.

const globalForDb = globalThis as unknown as { reservaDb?: PrismaClient };

export const db = globalForDb.reservaDb ?? createPrismaClient(process.env.DATABASE_URL);

// Reuse one client across hot reloads in dev instead of leaking connections.
if (process.env.NODE_ENV !== "production") globalForDb.reservaDb = db;
