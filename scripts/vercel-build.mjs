// Vercel runs `npm run vercel-build` instead of `build` when this script exists.
//
// Production deployments apply pending migrations (prisma migrate deploy, against the
// DIRECT Neon URL from prisma.config.ts) before building, so code never ships ahead of its
// schema. Preview deployments skip migrations unless MIGRATE_ON_PREVIEW=true — set that
// only when previews get their own Neon branch, never when they share production's database.

import { execSync } from "node:child_process";

const run = (command) => execSync(command, { stdio: "inherit" });
const env = process.env.VERCEL_ENV ?? "development";
const migrate = env === "production" || process.env.MIGRATE_ON_PREVIEW === "true";

run("npx prisma generate");
if (migrate) {
  if (!process.env.DATABASE_URL_UNPOOLED && !process.env.DATABASE_URL) {
    console.error("No DATABASE_URL_UNPOOLED/DATABASE_URL: connect Neon (Storage → Neon) before deploying.");
    process.exit(1);
  }
  console.log(`[vercel-build] ${env}: applying migrations`);
  run("npx prisma migrate deploy");
} else {
  console.log(`[vercel-build] ${env}: skipping migrations (set MIGRATE_ON_PREVIEW=true for Neon preview branches)`);
}
run("npx next build");
