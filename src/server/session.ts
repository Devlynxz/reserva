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

/** Current signed-in, active staff member, or null. Memoized per request. */
export const getStaffSession = cache(async (): Promise<StaffSession | null> => {
  // Read headers first: it marks the render dynamic before the auth instance is created.
  const requestHeaders = await headers();
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  if (!session) return null;
  const { user } = session;
  if (!isRole(user.role) || user.disabledAt) return null;
  return { userId: user.id, name: user.name, email: user.email, role: user.role };
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
}

/** Server actions / route handlers: throw instead of redirecting. */
export async function assertArea(area: AdminArea): Promise<StaffSession> {
  const session = await getStaffSession();
  if (!session || !canAccess(session.role, area)) throw new AuthorizationError("Not allowed");
  return session;
}
