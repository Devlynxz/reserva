"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "../auth";
import { db } from "../data/db";
import { demoPassword, isDemo } from "../demo";
import { rateLimit, tooManyRequestsMessage } from "../rate-limit";
import { clientIp } from "../request";

export type DemoState = { error?: string };

/** One-click sign-in as the seeded owner or staff member. Only exists in demo mode. */
export async function demoSignInAction(role: "ADMIN" | "STAFF", _prev: DemoState): Promise<DemoState> {
  if (!isDemo()) return { error: "Not available." };
  if (role !== "ADMIN" && role !== "STAFF") return { error: "Not available." };

  const limit = await rateLimit("lookup", `demo:${await clientIp()}`);
  if (!limit.allowed) return { error: tooManyRequestsMessage(limit.retryAfterSec) };

  const user = await db.user.findFirst({ where: { role, disabledAt: null }, orderBy: { createdAt: "asc" }, select: { email: true } });
  if (!user) return { error: "The demo accounts aren't set up. Run the seed first." };

  const response = await getAuth().api.signInEmail({
    body: { email: user.email, password: demoPassword(role) },
    headers: await headers(),
    asResponse: true,
  });
  if (!response.ok) return { error: "The demo account's password doesn't match the seed. Re-run the seed." };
  redirect("/admin");
}
