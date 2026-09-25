import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { toCsv } from "@/lib/csv";
import { formatClock, formatShortDate } from "@/lib/display";
import { exportBookings } from "@/server/data/reports";
import { getSettings } from "@/server/data/settings";
import { AuthorizationError, assertArea } from "@/server/session";
import { reservaConfig } from "@reserva/config";

// GET /api/admin/reports/export?month=YYYY-MM — ADMIN only. Customer-entered text is in
// here (names, emails), so every cell goes through the formula-injection-safe CSV writer.

const query = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use ?month=YYYY-MM") });

export async function GET(request: NextRequest) {
  try {
    await assertArea("reports", request.headers);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: error.reason === "signed_out" ? 401 : 403 });
    }
    throw error;
  }

  const parsed = query.safeParse({ month: request.nextUrl.searchParams.get("month") });
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  const { month } = parsed.data;

  const settings = await getSettings();
  const tz = settings.timezone;
  const locale = reservaConfig.locale;
  const rows = await exportBookings(month, tz);
  const when = (d: Date) => `${formatShortDate(d, tz, locale)} ${formatClock(d, tz, locale)}`;

  const csv = toCsv(
    [
      ["Reference", "Status", "Source", "Package", "Place / staff", "Start", "End", "Guests", "Customer", "Email", "Phone", "Total", "Deposit", "Paid", "Currency", "Booked on"],
      ...rows.map((b) => [
        b.referenceCode,
        b.status,
        b.source,
        b.offering.name,
        b.resource.name,
        when(b.startAt),
        when(b.endAt),
        b.guestCount,
        b.customerName,
        b.customerEmail,
        b.customerPhone,
        b.totalAmount.toFixed(2),
        b.depositAmount.toFixed(2),
        b.amountPaid.toFixed(2),
        b.currency,
        when(b.createdAt),
      ]),
    ],
    { bom: true },
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="bookings-${month}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
