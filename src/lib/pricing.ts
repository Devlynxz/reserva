import { type LocalDate, isValidLocalDate, weekdayOf } from "./dates";
import { type Decimal, type MoneyInput, money, percentOf, roundMoney, toAmountString } from "./money";

// The only place a price is computed. The client never sends one.
//
//   base price
//   → weekend price, if the booking's local start date is a weekend day
//   → the most specific matching date-range override (fixed price, or × multiplier)
//   → + extra guests above includedGuests × extraGuestFee
//   = total → deposit = depositPercent of total
//
// Every step rounds to the currency, half up. The result carries line items so the
// booking can snapshot exactly how its price was built.

export type PricingOffering = {
  id: string;
  basePrice: MoneyInput;
  weekendPrice: MoneyInput | null;
  includedGuests: number;
  maxGuests: number;
  extraGuestFee: MoneyInput;
};

export type PricingOverride = {
  id: string;
  label: string;
  /** null = every resource / every offering. */
  resourceId: string | null;
  offeringId: string | null;
  /** Inclusive business-local dates. */
  startDate: LocalDate;
  endDate: LocalDate;
  fixedPrice: MoneyInput | null;
  multiplier: MoneyInput | null;
  createdAt: Date;
};

export type QuoteLine = {
  kind: "base" | "weekend" | "override" | "extra_guests";
  label: string;
  /** For extra guests: guest count and per-guest fee. */
  quantity?: number;
  unitAmount?: string;
  /** Line amount as a fixed-scale string ("1250.00"). For base/weekend/override it's the running base price. */
  amount: string;
};

export type Quote = {
  currency: string;
  lines: QuoteLine[];
  /** Price for the booking before extra guests. */
  basePrice: Decimal;
  extraGuests: number;
  extraGuestsAmount: Decimal;
  total: Decimal;
  depositPercent: Decimal;
  deposit: Decimal;
  isWeekend: boolean;
  override: { id: string; label: string } | null;
};

export type PricingErrorCode = "too_few_guests" | "too_many_guests" | "invalid_deposit_percent" | "invalid_input";

export class PricingError extends Error {
  override name = "PricingError";
  constructor(
    readonly code: PricingErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/** Resource+offering (3) beats offering (2) beats resource (1) beats business-wide (0). */
function specificity(rule: PricingOverride): number {
  return (rule.offeringId ? 2 : 0) + (rule.resourceId ? 1 : 0);
}

/** The override that applies, or null. Ties go to the most recently created rule. */
export function pickOverride(
  overrides: readonly PricingOverride[],
  context: { offeringId: string; resourceId: string; date: LocalDate },
): PricingOverride | null {
  const matches = overrides.filter(
    (rule) =>
      (rule.offeringId === null || rule.offeringId === context.offeringId) &&
      (rule.resourceId === null || rule.resourceId === context.resourceId) &&
      rule.startDate <= context.date &&
      context.date <= rule.endDate,
  );
  matches.sort(
    (a, b) =>
      specificity(b) - specificity(a) || b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id),
  );
  return matches[0] ?? null;
}

export function quote(input: {
  offering: PricingOffering;
  resourceId: string;
  /** Business-local date the booking STARTS on (an overnight is priced by its check-in night). */
  date: LocalDate;
  guestCount: number;
  overrides: readonly PricingOverride[];
  /** 0 = Sunday … 6 = Saturday. */
  weekendDays: readonly number[];
  depositPercent: MoneyInput;
  currency: string;
}): Quote {
  const { offering, resourceId, date, guestCount, overrides, weekendDays, currency } = input;

  if (!isValidLocalDate(date)) throw new PricingError("invalid_input", `Invalid date: ${date}`);
  if (!Number.isInteger(guestCount) || guestCount < 1) {
    throw new PricingError("too_few_guests", "At least one guest is required");
  }
  if (guestCount > offering.maxGuests) {
    throw new PricingError("too_many_guests", `This package allows up to ${offering.maxGuests} guests`);
  }
  const depositPercent = money(input.depositPercent);
  if (depositPercent.lte(0) || depositPercent.gt(100)) {
    throw new PricingError("invalid_deposit_percent", "Deposit percent must be above 0 and at most 100");
  }

  const lines: QuoteLine[] = [];
  let base = roundMoney(offering.basePrice, currency);
  lines.push({ kind: "base", label: "Base price", amount: toAmountString(base, currency) });

  const isWeekend = weekendDays.includes(weekdayOf(date));
  if (isWeekend && offering.weekendPrice !== null) {
    base = roundMoney(offering.weekendPrice, currency);
    lines.push({ kind: "weekend", label: "Weekend rate", amount: toAmountString(base, currency) });
  }

  const rule = pickOverride(overrides, { offeringId: offering.id, resourceId, date });
  if (rule) {
    if (rule.fixedPrice !== null) {
      base = roundMoney(rule.fixedPrice, currency);
    } else if (rule.multiplier !== null) {
      base = roundMoney(base.times(money(rule.multiplier)), currency);
    } else {
      throw new PricingError("invalid_input", `Override ${rule.id} has neither a fixed price nor a multiplier`);
    }
    lines.push({ kind: "override", label: rule.label, amount: toAmountString(base, currency) });
  }

  const extraGuests = Math.max(0, guestCount - offering.includedGuests);
  const fee = roundMoney(offering.extraGuestFee, currency);
  const extraGuestsAmount = roundMoney(fee.times(extraGuests), currency);
  if (extraGuests > 0) {
    lines.push({
      kind: "extra_guests",
      label: extraGuests === 1 ? "1 extra guest" : `${extraGuests} extra guests`,
      quantity: extraGuests,
      unitAmount: toAmountString(fee, currency),
      amount: toAmountString(extraGuestsAmount, currency),
    });
  }

  const total = base.plus(extraGuestsAmount);
  return {
    currency,
    lines,
    basePrice: base,
    extraGuests,
    extraGuestsAmount,
    total,
    depositPercent,
    deposit: percentOf(total, depositPercent, currency),
    isWeekend,
    override: rule ? { id: rule.id, label: rule.label } : null,
  };
}

/** JSON-safe snapshot stored on the booking (`priceBreakdown`). */
export function toPriceBreakdown(q: Quote) {
  return {
    currency: q.currency,
    lines: q.lines,
    total: toAmountString(q.total, q.currency),
    depositPercent: q.depositPercent.toString(),
    deposit: toAmountString(q.deposit, q.currency),
    override: q.override,
  };
}

export type PriceBreakdown = ReturnType<typeof toPriceBreakdown>;
