import "server-only";
import type { z } from "zod";
import { TransitionError } from "@/lib/booking-status";
import { BookingConflictError, BookingInputError } from "../data/errors";

/** What every server action returns: data, or a message safe to show the user. */
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string; fieldErrors?: Record<string, string> };

export function invalidInput(error: z.ZodError): ActionResult<never> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    fieldErrors[key] ??= issue.message;
  }
  return { ok: false, error: "Check the highlighted fields and try again.", code: "invalid_input", fieldErrors };
}

/** Known domain errors become their (user-safe) message; anything else is logged and hidden. */
export function actionError(error: unknown): ActionResult<never> {
  if (error instanceof BookingConflictError) return { ok: false, error: error.message, code: `conflict_${error.reason}` };
  if (error instanceof BookingInputError) return { ok: false, error: error.message, code: error.code };
  if (error instanceof TransitionError) return { ok: false, error: error.message, code: error.code };
  console.error(error);
  return { ok: false, error: "Something went wrong on our side. Please try again.", code: "internal" };
}
