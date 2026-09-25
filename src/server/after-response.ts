import "server-only";
import { after } from "next/server";

/**
 * Run work after the response is sent (emails, notifications). Outside a request — tests,
 * scripts — Next's `after` throws, so fall back to fire-and-forget. `task` must not throw.
 */
export function afterResponse(task: () => Promise<unknown>): void {
  try {
    after(task);
  } catch {
    void task();
  }
}
