import "server-only";
import { db } from "./db";

/** False for unknown or disabled users — disabled staff can't start new sessions. */
export async function isUserActive(userId: string): Promise<boolean> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { disabledAt: true } });
  return user !== null && user.disabledAt === null;
}
