import "server-only";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { type AdminArea, type Role, canAccess, isRole } from "@/lib/permissions";
import { getAuth } from "./auth";

export type StaffSession = {
  userId: string;
  name: string;
  email: string;
  role: Role;
};

/**
 * The active staff member behind these request headers, or null. Checked against the
 * database on every call (no cookie cache), so disabling someone or changing their role
 * takes effect on their next request.
 */
export async function staffSessionFrom(requestHeaders: Headers): Promise<StaffSession | null> {
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  if (!session) return null;
  const { user } = session;
  if (!isRole(user.role) || user.disabledAt) return null;
  return { userId: user.id, name: user.name, email: user.email, role: user.role };
}

/** Current signed-in, active staff member, or null. Memoized per request. */
export const getStaffSession = cache(async (): Promise<StaffSession | null> => {
  // Read headers first: it marks the render dynamic before the auth instance is created.
  return staffSessionFrom(await headers());
});

/** Pages/layouts: redirect to sign-in when signed out; 404 when the role can't see the area. */
export async function requireArea(area: AdminArea): Promise<StaffSession> {
  const session = await getStaffSession();
  if (!session) redirect("/sign-in");
  // 404 rather than 403: STAFF shouldn't learn which admin-only pages exist.
  if (!canAccess(session.role, area)) notFound();
  return session;
}

export class AuthorizationError extends Error {
  override name = "AuthorizationError";
  constructor(readonly reason: "signed_out" | "forbidden") {
    super(reason === "signed_out" ? "Sign in to continue." : "You don't have access to this.");
  }
}

/**
 * Server actions and route handlers: throw instead of redirecting. Route handlers pass
 * their request headers; actions read the current request's.
 */
export async function assertArea(area: AdminArea, requestHeaders?: Headers): Promise<StaffSession> {
  const session = requestHeaders ? await staffSessionFrom(requestHeaders) : await getStaffSession();
  if (!session) throw new AuthorizationError("signed_out");
  if (!canAccess(session.role, area)) throw new AuthorizationError("forbidden");
  return session;
}
