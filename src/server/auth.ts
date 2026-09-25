import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { db } from "./data/db";
import { isUserActive } from "./data/users";
import { trustedOrigins } from "./app-url";
import { env } from "./env";

// Email/password for ADMIN and STAFF only. Customers never have accounts: they book
// as guests and come back with reference code + email.
function createAuth() {
  // Fail with one readable list of missing/invalid variables, not a library error.
  const { BETTER_AUTH_SECRET, BETTER_AUTH_URL } = env();
  return betterAuth({
    database: prismaAdapter(db, { provider: "postgresql" }),
    secret: BETTER_AUTH_SECRET,
    baseURL: BETTER_AUTH_URL,
    trustedOrigins: trustedOrigins(),
    emailAndPassword: {
      enabled: true,
      // No public sign-up: users come from the seed or from an ADMIN at /admin/team.
      disableSignUp: true,
      minPasswordLength: 12,
    },
    user: {
      additionalFields: {
        // input: false — a client can never set these through Better Auth's endpoints.
        role: { type: "string", required: false, defaultValue: "STAFF", input: false },
        disabledAt: { type: "date", required: false, input: false },
      },
    },
    databaseHooks: {
      session: {
        create: {
          // Disabled staff keep their row (bookings reference them) but can't sign in.
          before: async (session) => {
            if (!(await isUserActive(session.userId))) return false;
          },
        },
      },
    },
    rateLimit: { enabled: true, window: 60, max: 10 },
    plugins: [nextCookies()], // must stay last: lets server actions set auth cookies
  });
}

type Auth = ReturnType<typeof createAuth>;
let instance: Auth | undefined;

/**
 * Created on first use, not at import: `next build` imports route modules to collect
 * page data, and it shouldn't need BETTER_AUTH_SECRET to do that.
 */
export function getAuth(): Auth {
  instance ??= createAuth();
  return instance;
}

export type AuthSession = Auth["$Infer"]["Session"];
