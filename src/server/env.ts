import "server-only";
import { z } from "zod";

// Every variable the app reads, validated once. `.env.example` documents the same list.
// Optional integrations (payments, email, jobs, blob, Sentry) degrade gracefully when unset.

const optional = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

    // Database (Neon via Vercel Marketplace)
    DATABASE_URL: z.url(),
    DATABASE_URL_UNPOOLED: optional,

    // Auth
    BETTER_AUTH_SECRET: z.string().min(32, "must be at least 32 characters"),
    BETTER_AUTH_URL: z.url(),
    NEXT_PUBLIC_APP_URL: z.url(),

    // Payments
    PAYMENT_PROVIDER: z.enum(["paymongo", "stripe", "none"]).default("none"),
    PAYMONGO_SECRET_KEY: optional,
    PAYMONGO_WEBHOOK_SECRET: optional,
    STRIPE_SECRET_KEY: optional,
    STRIPE_WEBHOOK_SECRET: optional,

    // Email
    RESEND_API_KEY: optional,
    EMAIL_FROM: optional,

    // Jobs, storage, monitoring
    INNGEST_EVENT_KEY: optional,
    INNGEST_SIGNING_KEY: optional,
    BLOB_READ_WRITE_TOKEN: optional,
    SENTRY_DSN: optional,
    NEXT_PUBLIC_SENTRY_DSN: optional,

    // Rate limiting: which request header carries the real client IP (set by your edge).
    CLIENT_IP_HEADER: z.string().trim().toLowerCase().default("x-real-ip"),

    // Content-Security-Policy: "report-only" logs violations without blocking (debugging a deployment).
    CSP_MODE: z.enum(["enforce", "report-only"]).default("enforce"),

    // Demo deployments show a banner and a one-click demo login.
    DEMO_MODE: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
  })
  .superRefine((env, ctx) => {
    const need = (key: keyof typeof env, when: string) => {
      if (!env[key]) ctx.addIssue({ code: "custom", path: [key], message: `required when ${when}` });
    };
    if (env.PAYMENT_PROVIDER === "paymongo") {
      need("PAYMONGO_SECRET_KEY", "PAYMENT_PROVIDER=paymongo");
      need("PAYMONGO_WEBHOOK_SECRET", "PAYMENT_PROVIDER=paymongo");
    }
    if (env.PAYMENT_PROVIDER === "stripe") {
      need("STRIPE_SECRET_KEY", "PAYMENT_PROVIDER=stripe");
      need("STRIPE_WEBHOOK_SECRET", "PAYMENT_PROVIDER=stripe");
    }
    if (env.RESEND_API_KEY) need("EMAIL_FROM", "RESEND_API_KEY is set");
  });

export type Env = z.infer<typeof envSchema>;

export class EnvError extends Error {
  override name = "EnvError";
}

/** Pure parse — exported for tests. Error lists every problem, never the values. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
    throw new EnvError(`Invalid environment configuration:\n${lines.join("\n")}`);
  }
  return result.data;
}

let cached: Env | undefined;

/** Validated env for runtime code. Parsed lazily so `next build` doesn't need secrets. */
export function env(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}

/** Tests only: forget the parsed env after stubbing variables. */
export function resetEnvCache(): void {
  cached = undefined;
}
