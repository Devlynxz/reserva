import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { PrismaClient } from "@/generated/prisma/client";

// How every Prisma client in this project is built: the app's (db.ts) and the seed's.
// Not "server-only", so the seed script can use it too.

/**
 * A PrismaClient whose connections all run in UTC. The pg adapter reads every timestamptz
 * as UTC and writes instants without an offset, so a session in another zone (e.g. a local
 * Postgres in Asia/Manila) would store every time shifted by that offset. Neon defaults
 * to UTC anyway.
 */
export function createPrismaClient(connectionString: string | undefined): PrismaClient {
  const pool = new pg.Pool({ connectionString });
  pool.on("connect", (client) => {
    // pg runs a client's queries in order, so this completes before any app query on it.
    client.query("SET TIME ZONE 'UTC'").catch((error: unknown) => {
      console.error("[db] could not set the session time zone to UTC:", error instanceof Error ? error.message : error);
    });
  });
  return new PrismaClient({ adapter: new PrismaPg(pool) });
}
