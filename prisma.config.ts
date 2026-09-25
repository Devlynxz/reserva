import { config } from "dotenv";
import { defineConfig } from "prisma/config";

config({ quiet: true });

// The CLI (migrate, db seed, studio) uses the DIRECT connection: migrations must not go
// through Neon's pooler. The app's runtime client uses the pooled DATABASE_URL instead
// (src/server/data/db.ts). `prisma generate` needs no connection, so a missing URL is
// tolerated here and reported by the command that actually needs it.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "",
  },
});
