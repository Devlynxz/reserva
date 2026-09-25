import { afterEach, describe, expect, it, vi } from "vitest";
import { appUrl, trustedOrigins } from "../app-url";
import { resetEnvCache } from "../env";

describe("appUrl / trustedOrigins", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetEnvCache();
  });

  const stub = (vars: Record<string, string>) => {
    for (const [k, v] of Object.entries(vars)) vi.stubEnv(k, v);
    resetEnvCache();
  };

  it("uses NEXT_PUBLIC_APP_URL in production and locally", () => {
    stub({ NEXT_PUBLIC_APP_URL: "https://villaserena.ph", VERCEL_ENV: "production", VERCEL_URL: "reserva-abc.vercel.app" });
    expect(appUrl()).toBe("https://villaserena.ph");
  });

  it("uses the preview deployment's own URL on previews", () => {
    stub({ NEXT_PUBLIC_APP_URL: "https://villaserena.ph", VERCEL_ENV: "preview", VERCEL_URL: "reserva-git-feature.vercel.app" });
    expect(appUrl()).toBe("https://reserva-git-feature.vercel.app");
  });

  it("trusts the app, auth URL and this deployment's Vercel URLs, deduplicated", () => {
    stub({
      BETTER_AUTH_URL: "https://villaserena.ph",
      NEXT_PUBLIC_APP_URL: "https://villaserena.ph",
      VERCEL_URL: "reserva-abc.vercel.app",
      VERCEL_BRANCH_URL: "reserva-git-main.vercel.app",
    });
    expect(trustedOrigins()).toEqual(["https://villaserena.ph", "https://reserva-abc.vercel.app", "https://reserva-git-main.vercel.app"]);
  });
});
