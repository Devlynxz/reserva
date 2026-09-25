import DecimalJs from "decimal.js";

// Money is always a Decimal, never a float. Amounts are stored as Decimal(12,2) with the
// currency code next to them, and rounding is ROUND_HALF_UP everywhere (a centavo at .5
// goes up — what a cashier expects). This clone keeps our settings independent of any
// other code that configures decimal.js globally (Prisma ships its own copy).

export const Decimal = DecimalJs.clone({ precision: 40, rounding: DecimalJs.ROUND_HALF_UP });
export type Decimal = DecimalJs;

/** Anything we accept as an amount. Numbers must be integers: 0.1 isn't exact in binary. */
export type MoneyInput = Decimal | string | number | { toString(): string };

export class MoneyError extends Error {
  override name = "MoneyError";
}

/** Largest amount that fits Decimal(12,2). */
export const MAX_AMOUNT = new Decimal("9999999999.99");

export function money(value: MoneyInput): Decimal {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new MoneyError(`Pass fractional amounts as strings, got the number ${value}`);
    }
    return new Decimal(value);
  }
  const text = typeof value === "string" ? value.trim() : value.toString();
  if (!/^-?\d+(\.\d+)?$/.test(text)) throw new MoneyError(`Not a decimal amount: ${JSON.stringify(text)}`);
  return new Decimal(text);
}

const digitsCache = new Map<string, number>();
// Intl formats any three letters as a "currency", so check against the real list.
const knownCurrencies = new Set(Intl.supportedValuesOf("currency"));

/** Minor-unit digits for an ISO-4217 code: PHP/USD → 2, JPY/KRW → 0. */
export function currencyDigits(currency: string): number {
  let digits = digitsCache.get(currency);
  if (digits === undefined) {
    if (!/^[A-Z]{3}$/.test(currency)) throw new MoneyError(`Not an ISO-4217 code: ${currency}`);
    if (!knownCurrencies.has(currency)) throw new MoneyError(`Unknown currency: ${currency}`);
    // Always set for style "currency" (ECMA-402 derives it from the ISO-4217 table).
    digits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits as number;
    digitsCache.set(currency, digits);
  }
  return digits;
}

/** Storage is Decimal(12,2), so three-decimal currencies (KWD, BHD…) aren't supported. */
export function isSupportedCurrency(currency: string): boolean {
  try {
    return currencyDigits(currency) <= 2;
  } catch {
    return false;
  }
}

/** Round to the currency's minor unit, half up. */
export function roundMoney(amount: MoneyInput, currency: string): Decimal {
  return money(amount).toDecimalPlaces(currencyDigits(currency), Decimal.ROUND_HALF_UP);
}

export function sum(amounts: readonly MoneyInput[]): Decimal {
  return amounts.reduce<Decimal>((total, amount) => total.plus(money(amount)), new Decimal(0));
}

/** `pct` percent of `amount`, rounded to the currency (e.g. a 50% deposit). */
export function percentOf(amount: MoneyInput, pct: MoneyInput, currency: string): Decimal {
  return roundMoney(money(amount).times(money(pct)).dividedBy(100), currency);
}

/**
 * Integer minor units for payment providers (₱1,250.50 → 125050). Refuses amounts
 * that aren't already rounded, so a rounding decision can't hide inside a conversion.
 */
export function toMinorUnits(amount: MoneyInput, currency: string): number {
  const value = money(amount);
  const digits = currencyDigits(currency);
  if (value.decimalPlaces() > digits) {
    throw new MoneyError(`${value.toString()} has more decimals than ${currency} allows`);
  }
  const minor = value.times(new Decimal(10).pow(digits));
  if (!minor.abs().lte(Number.MAX_SAFE_INTEGER)) throw new MoneyError("Amount too large");
  return minor.toNumber();
}

export function fromMinorUnits(minor: number, currency: string): Decimal {
  if (!Number.isSafeInteger(minor)) throw new MoneyError(`Minor units must be an integer, got ${minor}`);
  return new Decimal(minor).dividedBy(new Decimal(10).pow(currencyDigits(currency)));
}

/** Fixed-scale string for storage and JSON snapshots ("1250.50"). */
export function toAmountString(amount: MoneyInput, currency: string): string {
  return roundMoney(amount, currency).toFixed(currencyDigits(currency));
}

/** Localized display, e.g. "₱1,250.50". Formats the exact decimal string, not a float. */
export function formatMoney(amount: MoneyInput, currency: string, locale = "en-PH"): string {
  const digits = currencyDigits(currency);
  const formatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return formatter.format(roundMoney(amount, currency).toFixed(digits) as Intl.StringNumericLiteral);
}
