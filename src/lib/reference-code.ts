// Booking reference codes like RSV-7K3Q9: short enough to read over the phone.
// The alphabet drops characters people confuse when reading or typing (0/O, 1/I/L),
// leaving 31 symbols → 31^5 ≈ 28.6M codes. Uniqueness is enforced by the database
// (retry on collision); secrecy is NOT — codes are not access tokens.

export const REFERENCE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const REFERENCE_PREFIX = "RSV";
export const REFERENCE_LENGTH = 5;

const PATTERN = new RegExp(`^${REFERENCE_PREFIX}-[${REFERENCE_ALPHABET}]{${REFERENCE_LENGTH}}$`);

/** Fills a byte array with random values. Injectable so tests are deterministic. */
export type RandomBytes = (length: number) => Uint8Array;

const cryptoBytes: RandomBytes = (length) => crypto.getRandomValues(new Uint8Array(length));

// Largest multiple of 31 below 256: bytes at or above it are discarded so every symbol
// is equally likely (plain `byte % 31` would favour the first 8 symbols).
const UNBIASED_LIMIT = 256 - (256 % REFERENCE_ALPHABET.length);

export function generateReferenceCode(randomBytes: RandomBytes = cryptoBytes): string {
  let code = "";
  while (code.length < REFERENCE_LENGTH) {
    for (const byte of randomBytes(REFERENCE_LENGTH * 2)) {
      if (byte >= UNBIASED_LIMIT) continue;
      code += REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length];
      if (code.length === REFERENCE_LENGTH) break;
    }
  }
  return `${REFERENCE_PREFIX}-${code}`;
}

/**
 * Canonical form of what a customer typed: case, spaces and dashes don't matter, and the
 * prefix is optional ("rsv 7k3q9", "7K3Q9" → "RSV-7K3Q9"). Returns null if it can't be valid.
 */
export function normalizeReferenceCode(input: string): string | null {
  let compact = input.toUpperCase().replace(/[\s-]/g, "");
  if (compact.startsWith(REFERENCE_PREFIX) && compact.length === REFERENCE_PREFIX.length + REFERENCE_LENGTH) {
    compact = compact.slice(REFERENCE_PREFIX.length);
  }
  const code = `${REFERENCE_PREFIX}-${compact}`;
  return PATTERN.test(code) ? code : null;
}

export function isReferenceCode(value: string): boolean {
  return PATTERN.test(value);
}
