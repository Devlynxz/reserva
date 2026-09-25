import "server-only";
import type { z } from "zod";
import { TransitionError } from "@/lib/booking-status";
import type { AdminArea } from "@/lib/permissions";
import { PaymentAmountError } from "../../data/admin-bookings";
import { CatalogError } from "../../data/admin-catalog";
import { BlockConflictError, BookingConflictError, BookingInputError, BookingNotFoundError, isUniqueViolation } from "../../data/errors";
import { TeamError } from "../../data/team";
import { AuthorizationError, type StaffSession, assertArea } from "../../session";

/** State for `useActionState` admin forms. */
export type FormState = { ok?: boolean; message?: string; error?: string; fieldErrors?: Record<string, string> };

/**
 * FormData → plain object for zod. Empty strings become undefined (so optional fields are
 * optional), `booleans` become true/false from checkbox presence, `multi` keep every value.
 */
export function formObject(
  formData: FormData,
  options: { booleans?: readonly string[]; multi?: readonly string[] } = {},
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of new Set(formData.keys())) {
    if (key.startsWith("$ACTION")) continue;
    if (options.multi?.includes(key)) {
      out[key] = formData.getAll(key).map(String).filter((v) => v !== "");
      continue;
    }
    const value = String(formData.get(key) ?? "").trim();
    out[key] = value === "" ? undefined : value;
  }
  for (const key of options.booleans ?? []) out[key] = formData.has(key);
  for (const key of options.multi ?? []) out[key] ??= [];
  return out;
}

export function invalid(error: z.ZodError): FormState {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) fieldErrors[String(issue.path[0] ?? "form")] ??= issue.message;
  return { error: "Check the highlighted fields.", fieldErrors };
}

/** Session for `area`, or a FormState explaining why not. */
export async function guard(area: AdminArea): Promise<StaffSession | FormState> {
  try {
    return await assertArea(area);
  } catch (error) {
    if (error instanceof AuthorizationError) return { error: error.message };
    throw error;
  }
}

export function isSession(value: StaffSession | FormState): value is StaffSession {
  return "userId" in value;
}

/** Known domain errors become form messages; anything else is logged and hidden. */
export function failure(error: unknown): FormState {
  if (error instanceof CatalogError || error instanceof TeamError) {
    return error.field ? { error: error.message, fieldErrors: { [error.field]: error.message } } : { error: error.message };
  }
  if (
    error instanceof BookingConflictError ||
    error instanceof BookingInputError ||
    error instanceof BookingNotFoundError ||
    error instanceof BlockConflictError ||
    error instanceof TransitionError ||
    error instanceof PaymentAmountError ||
    error instanceof AuthorizationError
  ) {
    return { error: error.message };
  }
  if (isUniqueViolation(error)) return { error: "That short name is taken.", fieldErrors: { slug: "That short name is taken." } };
  console.error(error);
  return { error: "Something went wrong. Please try again." };
}
