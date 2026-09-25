import { describe, expect, it } from "vitest";
import { EnvError, parseEnv } from "../env";

const minimal = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/reserva",
  BETTER_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3000",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
};

describe("parseEnv", () => {
  it("accepts the minimal required set and applies defaults", () => {
    const env = parseEnv(minimal);
    expect(env.PAYMENT_PROVIDER).toBe("none");
    expect(env.CLIENT_IP_HEADER).toBe("x-real-ip");
    expect(env.DEMO_MODE).toBe(false);
    expect(env.RESEND_API_KEY).toBeUndefined();
  });

  it("treats empty optional values as unset", () => {
    expect(parseEnv({ ...minimal, RESEND_API_KEY: "" }).RESEND_API_KEY).toBeUndefined();
  });

  it("lists every missing required variable without echoing values", () => {
    const secret = "short-secret-value";
    try {
      parseEnv({ BETTER_AUTH_SECRET: secret });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(EnvError);
      const message = (error as Error).message;
      for (const key of ["DATABASE_URL", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "NEXT_PUBLIC_APP_URL"]) {
        expect(message).toContain(key);
      }
      expect(message).not.toContain(secret);
    }
  });

  it("requires the selected provider's keys", () => {
    expect(() => parseEnv({ ...minimal, PAYMENT_PROVIDER: "paymongo" })).toThrow(/PAYMONGO_SECRET_KEY/);
    expect(() => parseEnv({ ...minimal, PAYMENT_PROVIDER: "stripe", STRIPE_SECRET_KEY: "sk_test_1" })).toThrow(
      /STRIPE_WEBHOOK_SECRET/,
    );
    expect(
      parseEnv({ ...minimal, PAYMENT_PROVIDER: "stripe", STRIPE_SECRET_KEY: "sk", STRIPE_WEBHOOK_SECRET: "whsec" })
        .PAYMENT_PROVIDER,
    ).toBe("stripe");
  });

  it("requires a sender when email is configured", () => {
    expect(() => parseEnv({ ...minimal, RESEND_API_KEY: "re_123" })).toThrow(/EMAIL_FROM/);
  });
});
