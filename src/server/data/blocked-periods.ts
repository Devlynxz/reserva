import "server-only";
import { expireStaleHolds } from "./bookings";
import { db } from "./db";
import { BlockConflictError, CONSTRAINTS, isExclusionViolation } from "./errors";

export type BlockedPeriodInput = {
  /** null = close the whole business. */
  resourceId: string | null;
  startAt: Date;
  endAt: Date;
  reason?: string;
  actorId?: string | null;
};

/**
 * Close a resource (or everything) for a period. Refused while ACTIVE bookings overlap it:
 * those need cancelling or moving first. Stale holds are expired first so an abandoned
 * checkout doesn't stand in the way.
 */
export async function createBlockedPeriod(input: BlockedPeriodInput, options: { now?: Date } = {}) {
  const now = options.now ?? new Date();
  try {
    return await db.$transaction(async (tx) => {
      await expireStaleHolds(tx, { now, resourceIds: input.resourceId ? [input.resourceId] : undefined });
      return tx.blockedPeriod.create({
        data: {
          resourceId: input.resourceId,
          startAt: input.startAt,
          endAt: input.endAt,
          reason: input.reason ?? null,
          createdById: input.actorId ?? null,
        },
        select: { id: true, resourceId: true, startAt: true, endAt: true, reason: true },
      });
    });
  } catch (error) {
    if (isExclusionViolation(error, CONSTRAINTS.blockOverBookings)) throw new BlockConflictError();
    throw error;
  }
}

export async function deleteBlockedPeriod(id: string): Promise<void> {
  await db.blockedPeriod.delete({ where: { id } });
}
