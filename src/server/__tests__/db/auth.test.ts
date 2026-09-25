import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { beforeEach, expect, it } from "vitest";
import { getAuth } from "@/server/auth";
import { db, describeDb, resetDb } from "@/test/db";

// Staff accounts are created the way the seed (and later /admin/team) creates them:
// a user row + a Better Auth "credential" account with a scrypt hash.
const PASSWORD = "correct-horse-battery";

async function createStaff(email: string, role: "ADMIN" | "STAFF", disabledAt: Date | null = null) {
  const id = randomUUID();
  await db.user.create({
    data: {
      id,
      name: email.split("@")[0]!,
      email,
      emailVerified: true,
      role,
      disabledAt,
      accounts: { create: { id: randomUUID(), accountId: id, providerId: "credential", password: await hashPassword(PASSWORD) } },
    },
  });
  return id;
}

const signIn = (email: string, password = PASSWORD) =>
  getAuth().api.signInEmail({ body: { email, password }, asResponse: true });

describeDb("staff authentication", () => {
  beforeEach(resetDb);

  it("signs in a seeded-style account and exposes the role on the session", async () => {
    await createStaff("owner@example.com", "ADMIN");
    const response = await signIn("owner@example.com");
    expect(response.status).toBe(200);

    const cookie = response.headers.get("set-cookie")!;
    expect(cookie).toMatch(/better-auth\.session_token=/);
    const session = await getAuth().api.getSession({ headers: new Headers({ cookie: cookie.split(";")[0]! }) });
    expect(session?.user).toMatchObject({ email: "owner@example.com", role: "ADMIN" });
  });

  it("rejects a wrong password", async () => {
    await createStaff("staff@example.com", "STAFF");
    expect((await signIn("staff@example.com", "not-the-password")).status).toBe(401);
  });

  it("refuses to start a session for a disabled account", async () => {
    await createStaff("gone@example.com", "STAFF", new Date());
    const response = await signIn("gone@example.com");
    expect(response.status).not.toBe(200);
    expect(await db.session.count()).toBe(0);
  });

  it("has public sign-up switched off", async () => {
    const response = await getAuth().api.signUpEmail({
      body: { email: "new@example.com", password: PASSWORD, name: "New" },
      asResponse: true,
    });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(await db.user.count()).toBe(0);
  });

  it("ignores attempts to set role through the API", async () => {
    await createStaff("staff@example.com", "STAFF");
    const response = await signIn("staff@example.com");
    const cookie = response.headers.get("set-cookie")!.split(";")[0]!;
    const update = await getAuth().api.updateUser({
      body: { role: "ADMIN" } as never,
      headers: new Headers({ cookie }),
      asResponse: true,
    });
    expect(update.status).toBeGreaterThanOrEqual(400);
    expect((await db.user.findUniqueOrThrow({ where: { email: "staff@example.com" } })).role).toBe("STAFF");
  });
});
