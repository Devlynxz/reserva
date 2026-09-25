// Removes personal data from error reports before they leave the server or browser.
//
// Reserva handles names, emails, phone numbers and booking-link tokens. Error messages,
// URLs, breadcrumbs and request payloads can all carry them, so every Sentry event passes
// through `scrubEvent` (beforeSend / beforeBreadcrumb). It works on plain data, so it
// doesn't depend on the Sentry SDK and can be tested exhaustively.

export const REDACTED = "[redacted]";

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// Phone numbers as people write them: +63 917 123 4567, (02) 8123-4567, 0917-123-4567,
// 09171234567, +639171234567. Amounts like 12000.00 and times like 10:00 don't match.
const PHONE = /(?:\+\d{1,3}[\s-]?)?\(?\d{2,4}\)?[\s-]\d{3,4}[\s-]\d{3,4}|\b0\d{9,10}\b|\+\d{10,13}\b/g;
// Access tokens and other secrets in query strings.
const SECRET_PARAM = /([?&](?:t|token|access_token|code|key|signature)=)[^&#\s]+/gi;

/** Keys whose values are never sent, whatever they contain. */
const SENSITIVE_KEYS = new Set([
  "authorization",
  "cookie",
  "cookies",
  "set-cookie",
  "password",
  "email",
  "phone",
  "name",
  "customername",
  "customeremail",
  "customerphone",
  "customernotes",
  "internalnotes",
  "notes",
  "ip_address",
  "accesstoken",
  "accesstokenhash",
  "token",
  "secret",
  "data", // request bodies
]);

export function scrubString(value: string): string {
  return value.replace(SECRET_PARAM, `$1${REDACTED}`).replace(EMAIL, REDACTED).replace(PHONE, REDACTED);
}

/** Deep copy with sensitive keys dropped and strings scrubbed. Cycles and depth are bounded. */
export function scrubValue(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (typeof value === "string") return scrubString(value);
  if (value === null || typeof value !== "object") return value;
  if (depth > 12 || seen.has(value)) return REDACTED;
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => scrubValue(item, depth + 1, seen));
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    out[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? REDACTED : scrubValue(inner, depth + 1, seen);
  }
  return out;
}

type Scrubbable = { user?: unknown; request?: { cookies?: unknown; data?: unknown } };

/** Scrubs a Sentry event (or breadcrumb). Drops the user and the request body entirely. */
export function scrubEvent<T extends object>(event: T): T {
  const copy = scrubValue(event) as T & Scrubbable;
  delete copy.user;
  if (copy.request) {
    delete copy.request.cookies;
    delete copy.request.data;
  }
  return copy;
}

/**
 * Sentry's own collection switches (SDK v11 `dataCollection`), all at the minimum:
 * the scrubber above is a second line of defence, not the only one.
 */
export const SENTRY_DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: { request: { allow: ["user-agent", "content-type"] }, response: false },
  urlQueryParams: false,
  databaseQueryData: false,
};
