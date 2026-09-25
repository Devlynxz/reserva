import "server-only";
import { formatClock, formatRange, formatShortDate } from "@/lib/display";
import { formatMoney } from "@/lib/money";
import { getSettings } from "@/server/data/settings";
import { reservaConfig } from "@reserva/config";

/** Settings + formatters in the business timezone and locale, for admin pages. */
export async function adminFormat() {
  const settings = await getSettings();
  const tz = settings.timezone;
  const locale = reservaConfig.locale;
  return {
    settings,
    tz,
    locale,
    money: (amount: string, currency = settings.currency) => formatMoney(amount, currency, locale),
    /** Headline figures: whole units ("₱140,900") so they fit a stat card on a phone. */
    moneyShort: (amount: string, currency = settings.currency) => formatMoney(amount, currency, locale, { wholeUnits: true }),
    date: (d: Date) => formatShortDate(d, tz, locale),
    time: (d: Date) => formatClock(d, tz, locale),
    when: (d: Date) => `${formatShortDate(d, tz, locale)}, ${formatClock(d, tz, locale)}`,
    range: (a: Date, b: Date) => formatRange(a, b, tz, locale),
  };
}

export const WEEKDAY_OPTIONS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label, i) => ({ value: String(i), label }));
