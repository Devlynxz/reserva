import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// The only PrismaClient. Everything that touches the database lives in src/server/data/*.
// Runtime uses the POOLED url; migrations use the direct one (prisma.config.ts).
// Construction doesn't connect, so importing this during `next build` is safe.

function createClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

const globalForDb = globalThis as unknown as { reservaDb?: PrismaClient };

export const db = globalForDb.reservaDb ?? createClient();

// Reuse one client across hot reloads in dev instead of leaking connections.
if (process.env.NODE_ENV !== "production") globalForDb.reservaDb = db;
