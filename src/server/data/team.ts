import "server-only";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import type { Role } from "@/lib/permissions";
import { db } from "./db";
import { isUniqueViolation } from "./errors";

// Staff accounts. There's no public sign-up: an ADMIN creates accounts here and hands the
// person their first password. Accounts are disabled, never deleted — bookings and
// payments keep pointing at who did what.

export class TeamError extends Error {
  override name = "TeamError";
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
  }
}

export function listTeam() {
  return db.user.findMany({
    orderBy: [{ disabledAt: { sort: "asc", nulls: "first" } }, { role: "asc" }, { name: "asc" }],
    select: { id: true, name: true, email: true, role: true, disabledAt: true, createdAt: true },
  });
}

export async function createTeamMember(input: { name: string; email: string; role: Role; password: string }) {
  const id = randomUUID();
  try {
    await db.user.create({
      data: {
        id,
        name: input.name,
        email: input.email,
        emailVerified: true,
        role: input.role,
        accounts: { create: { id: randomUUID(), accountId: id, providerId: "credential", password: await hashPassword(input.password) } },
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new TeamError("Someone already uses that email.", "email");
    throw error;
  }
  return id;
}

async function activeAdmins(): Promise<number> {
  return db.user.count({ where: { role: "ADMIN", disabledAt: null } });
}

/** Disabling signs the person out everywhere immediately. */
export async function setTeamMemberDisabled(userId: string, disabled: boolean, actorId: string): Promise<void> {
  if (userId === actorId) throw new TeamError("You can't disable your own account.");
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true, disabledAt: true } });
  if (!user) throw new TeamError("That account doesn't exist.");
  if (disabled && user.role === "ADMIN" && !user.disabledAt && (await activeAdmins()) <= 1) {
    throw new TeamError("There must be at least one active owner.");
  }
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { disabledAt: disabled ? new Date() : null } }),
    ...(disabled ? [db.session.deleteMany({ where: { userId } })] : []),
  ]);
}

export async function setTeamMemberRole(userId: string, role: Role, actorId: string): Promise<void> {
  if (userId === actorId) throw new TeamError("You can't change your own role.");
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true, disabledAt: true } });
  if (!user) throw new TeamError("That account doesn't exist.");
  if (role === "STAFF" && user.role === "ADMIN" && !user.disabledAt && (await activeAdmins()) <= 1) {
    throw new TeamError("There must be at least one active owner.");
  }
  await db.user.update({ where: { id: userId }, data: { role } });
}
