"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Button, Card, Field, Input, Stepper, Textarea, cn } from "@/components/ui";
import { addDays, formatTime, localDateOf, localMinuteOf } from "@/lib/dates";
import { formatRange } from "@/lib/display";
import { type BookingPreviewDTO, createBookingAction, previewBookingAction } from "@/server/actions/booking";
import { MonthCalendar, monthOf, monthRange } from "./month-calendar";
import { SLOT_PAGE_DAYS, SlotPicker } from "./slot-picker";
import type { AvailabilityOption, FlowOffering, FlowSelection, FlowSettings } from "./types";
import { useAvailability } from "./use-availability";

const STEPS = [
  { id: "package", label: "Package" },
  { id: "when", label: "Date & time" },
  { id: "details", label: "Your details" },
  { id: "review", label: "Review & pay" },
] as const;

type Details = { name: string; email: string; phone: string; notes: string };
type Errors = Partial<Record<"name" | "email" | "phone" | "notes", string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The public booking stepper. The chosen package, place, guests, date and time live in
 * the URL (shareable, refresh-safe, nothing personal); the customer's details stay in
 * memory only. The server prices the review step and creates the booking.
 */
export function BookingFlow({
  offerings,
  settings,
  initial,
}: {
  offerings: FlowOffering[];
  settings: FlowSettings;
  initial: FlowSelection;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [selection, setSelection] = useState<FlowSelection>(initial);
  const [details, setDetails] = useState<Details>({ name: "", email: "", phone: "", notes: "" });
  const [errors, setErrors] = useState<Errors>({});
  const headingRef = useRef<HTMLHeadingElement>(null);

  const offering = offerings.find((o) => o.slug === selection.offering) ?? null;
  const resource = offering?.resources.find((r) => r.id === selection.resource) ?? null;

  // Keep the non-personal choices in the URL.
  useEffect(() => {
    const params = new URLSearchParams();
    if (selection.offering) params.set("offering", selection.offering);
    if (selection.resource !== "any") params.set("resource", selection.resource);
    if (selection.guests > 1) params.set("guests", String(selection.guests));
    if (selection.date) params.set("date", selection.date);
    if (selection.time) params.set("time", selection.time);
    const query = params.toString();
    window.history.replaceState(null, "", query ? `/book?${query}` : "/book");
  }, [selection]);

  // Move focus to the step heading so screen-reader and keyboard users land on the new step.
  const goTo = useCallback((next: number) => {
    setStep(next);
    requestAnimationFrame(() => {
      headingRef.current?.focus();
      headingRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  }, []);

  const update = (patch: Partial<FlowSelection>) => setSelection((s) => ({ ...s, ...patch }));

  const chooseOffering = (slug: string) => {
    const next = offerings.find((o) => o.slug === slug)!;
    const onlyResource = next.resources.length === 1 ? next.resources[0]!.id : "any";
    update({ offering: slug, resource: onlyResource, guests: Math.min(Math.max(1, next.includedGuests), next.maxGuests), date: null, time: null });
  };

  const canContinue = [
    Boolean(offering),
    Boolean(offering && selection.date && (offering.mode === "WINDOW" || selection.time)),
    true,
    true,
  ][step];

  const validateDetails = (): boolean => {
    const next: Errors = {};
    if (!details.name.trim()) next.name = "Enter your name.";
    if (!EMAIL.test(details.email.trim())) next.email = "Enter an email address like name@example.com.";
    if (details.phone.trim() && !/^\+?[\d\s()-]{7,20}$/.test(details.phone.trim())) {
      next.phone = "Enter a phone number with digits only, like 0917 123 4567.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onContinue = () => {
    if (step === 2 && !validateDetails()) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>("[aria-invalid=true]")?.focus());
      return;
    }
    goTo(step + 1);
  };

  return (
    <div className="mx-auto max-w-3xl px-4 pt-6 pb-32 sm:px-6 sm:pt-10">
      <Stepper steps={STEPS} current={step} className="mb-8" />
      <h1 ref={headingRef} tabIndex={-1} className="scroll-mt-24 text-2xl font-extrabold outline-none sm:text-3xl">
        {["Choose a package", "Pick a date", "Your details", "Review your booking"][step]}
        {step === 1 && offering?.mode === "SLOT" && " and time"}
      </h1>

      <div className="mt-6">
        {step === 0 && (
          <PackageStep offerings={offerings} selection={selection} onOffering={chooseOffering} onChange={update} />
        )}
        {step === 1 && offering && (
          <WhenStep offering={offering} selection={selection} settings={settings} onChange={update} />
        )}
        {step === 2 && <DetailsStep details={details} errors={errors} onChange={setDetails} />}
        {step === 3 && offering && (
          <ReviewStep
            offering={offering}
            resourceName={resource?.name ?? null}
            selection={selection}
            details={details}
            settings={settings}
            onEdit={goTo}
            onBooked={(url) => router.push(url)}
          />
        )}
      </div>

      {step < 3 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
            {step > 0 ? (
              <Button variant="ghost" onClick={() => goTo(step - 1)}>
                Back
              </Button>
            ) : (
              <span />
            )}
            <Button onClick={onContinue} disabled={!canContinue} size="lg">
              Continue
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Step 1: package, place/person, guests ─────────────────────────────────

function PackageStep({
  offerings,
  selection,
  onOffering,
  onChange,
}: {
  offerings: FlowOffering[];
  selection: FlowSelection;
  onOffering: (slug: string) => void;
  onChange: (patch: Partial<FlowSelection>) => void;
}) {
  const offering = offerings.find((o) => o.slug === selection.offering);
  if (offerings.length === 0) {
    return <p className="text-ink-muted">Nothing is open for booking right now. Please contact us directly.</p>;
  }
  const staff = offering?.resources.every((r) => r.type === "STAFF");

  return (
    <div className="space-y-8">
      <fieldset>
        <legend className="sr-only">Package</legend>
        <div className="space-y-3">
          {offerings.map((o) => (
            <ChoiceCard key={o.slug} name="offering" checked={o.slug === selection.offering} onChange={() => onOffering(o.slug)}>
              <span className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="font-bold">{o.name}</span>
                <span className="font-extrabold tabular-nums">{o.price}</span>
              </span>
              <span className="mt-1 block text-sm text-ink tabular-nums">{o.schedule}</span>
              {o.weekendPrice && <span className="block text-sm text-ink-muted tabular-nums">Weekends {o.weekendPrice}</span>}
              {o.description && <span className="mt-1 block text-sm text-ink-muted">{o.description}</span>}
            </ChoiceCard>
          ))}
        </div>
      </fieldset>

      {offering && offering.resources.length > 1 && (
        <fieldset>
          <legend className="mb-3 text-lg font-bold">{staff ? "Who would you like?" : "Where?"}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <ChoiceCard name="resource" checked={selection.resource === "any"} onChange={() => onChange({ resource: "any", date: null, time: null })}>
              <span className="font-bold">No preference</span>
              <span className="mt-1 block text-sm text-ink-muted">{staff ? "First available" : "Any open place"}</span>
            </ChoiceCard>
            {offering.resources.map((r) => (
              <ChoiceCard key={r.id} name="resource" checked={selection.resource === r.id} onChange={() => onChange({ resource: r.id, date: null, time: null })}>
                <span className="font-bold">{r.name}</span>
                {r.description && <span className="mt-1 block text-sm text-ink-muted">{r.description}</span>}
              </ChoiceCard>
            ))}
          </div>
        </fieldset>
      )}

      {offering && offering.maxGuests > 1 && (
        <GuestPicker offering={offering} value={selection.guests} onChange={(guests) => onChange({ guests })} />
      )}
    </div>
  );
}

function GuestPicker({ offering, value, onChange }: { offering: FlowOffering; value: number; onChange: (n: number) => void }) {
  const set = (n: number) => onChange(Math.min(offering.maxGuests, Math.max(1, n)));
  return (
    <div>
      <label htmlFor="guests" className="text-lg font-bold">
        How many guests?
      </label>
      {offering.guests && <p className="mt-1 text-sm text-ink-muted">{offering.guests}</p>}
      <div className="mt-3 flex items-center gap-2">
        <Button variant="secondary" onClick={() => set(value - 1)} disabled={value <= 1} aria-label="One guest fewer">
          −
        </Button>
        <Input
          id="guests"
          type="number"
          inputMode="numeric"
          min={1}
          max={offering.maxGuests}
          value={value}
          onChange={(e) => set(Number(e.target.value) || 1)}
          className="w-20 text-center tabular-nums"
        />
        <Button variant="secondary" onClick={() => set(value + 1)} disabled={value >= offering.maxGuests} aria-label="One guest more">
          +
        </Button>
      </div>
    </div>
  );
}

function ChoiceCard({
  name,
  checked,
  onChange,
  children,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  children: React.ReactNode;
}) {
  return (
    <label
      className={cn(
        "block cursor-pointer rounded-card border bg-surface p-4 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand",
        checked ? "border-brand bg-brand-soft" : "border-line hover:border-line-strong",
      )}
    >
      <input type="radio" name={name} checked={checked} onChange={onChange} className="sr-only" />
      {children}
    </label>
  );
}

// ─── Step 2: date (and time) ────────────────────────────────────────────────

function WhenStep({
  offering,
  selection,
  settings,
  onChange,
}: {
  offering: FlowOffering;
  selection: FlowSelection;
  settings: FlowSettings;
  onChange: (patch: Partial<FlowSelection>) => void;
}) {
  const { today, lastBookableDate, timeZone, locale } = settings;
  const [month, setMonth] = useState(monthOf(selection.date ?? today));
  const [pageStart, setPageStart] = useState(() => {
    if (!selection.date || selection.date < today) return today;
    return selection.date;
  });

  const range =
    offering.mode === "WINDOW"
      ? monthRange(month, today, lastBookableDate)
      : { from: pageStart, to: [addDays(pageStart, SLOT_PAGE_DAYS - 1), lastBookableDate].sort()[0]! };
  const { state, retry } = useAvailability(offering.slug, range.from, range.to);
  const resourceFilter = useCallback(
    (o: AvailabilityOption) => selection.resource === "any" || o.resourceId === selection.resource,
    [selection.resource],
  );

  const chosen = useMemo(() => {
    if (state.status !== "ready" || !selection.date) return null;
    return (
      state.options.filter(resourceFilter).find((o) => {
        const start = new Date(o.startAt);
        return (
          localDateOf(start, timeZone) === selection.date &&
          (offering.mode === "WINDOW" || formatTime(localMinuteOf(start, timeZone)) === selection.time)
        );
      }) ?? null
    );
  }, [state, selection.date, selection.time, resourceFilter, timeZone, offering.mode]);

  return (
    <div className="space-y-6">
      <Card className="p-4 sm:p-6">
        {offering.mode === "WINDOW" ? (
          <MonthCalendar
            month={month}
            onMonthChange={setMonth}
            today={today}
            lastBookableDate={lastBookableDate}
            timeZone={timeZone}
            locale={locale}
            availability={state}
            onRetry={retry}
            resourceFilter={resourceFilter}
            selected={selection.date}
            onSelect={(date) => onChange({ date, time: null })}
          />
        ) : (
          <SlotPicker
            pageStart={pageStart}
            onPageChange={setPageStart}
            today={today}
            lastBookableDate={lastBookableDate}
            timeZone={timeZone}
            locale={locale}
            availability={state}
            onRetry={retry}
            resourceFilter={resourceFilter}
            date={selection.date}
            time={selection.time}
            onSelectDate={(date) => onChange({ date, time: null })}
            onSelectTime={(time) => onChange({ time })}
          />
        )}
      </Card>
      {chosen && (
        <p className="rounded-card border border-brand/40 bg-brand-soft px-4 py-3 text-sm" role="status">
          <span className="font-semibold">{offering.name}:</span>{" "}
          <span className="tabular-nums">{formatRange(new Date(chosen.startAt), new Date(chosen.endAt), timeZone, locale)}</span>
        </p>
      )}
      <p className="text-sm text-ink-muted">All times are local to {settings.businessName}.</p>
    </div>
  );
}

// ─── Step 3: details ────────────────────────────────────────────────────────

function DetailsStep({ details, errors, onChange }: { details: Details; errors: Errors; onChange: (d: Details) => void }) {
  const set = (key: keyof Details) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onChange({ ...details, [key]: e.target.value });
  return (
    <Card className="p-4 sm:p-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Full name" required error={errors.name}>
          {(c) => <Input {...c} value={details.name} onChange={set("name")} autoComplete="name" />}
        </Field>
        <Field label="Email" required error={errors.email} hint="We'll send your confirmation here.">
          {(c) => <Input {...c} type="email" value={details.email} onChange={set("email")} autoComplete="email" inputMode="email" />}
        </Field>
        <Field label="Mobile number" error={errors.phone} hint="In case we need to reach you on the day.">
          {(c) => <Input {...c} type="tel" value={details.phone} onChange={set("phone")} autoComplete="tel" />}
        </Field>
        <Field label="Notes" error={errors.notes} className="sm:col-span-2">
          {(c) => (
            <Textarea
              {...c}
              value={details.notes}
              onChange={set("notes")}
              maxLength={1000}
              placeholder="Arrival time, celebrations, anything we should know"
            />
          )}
        </Field>
      </div>
    </Card>
  );
}

// ─── Step 4: review & pay ───────────────────────────────────────────────────

function ReviewStep({
  offering,
  resourceName,
  selection,
  details,
  settings,
  onEdit,
  onBooked,
}: {
  offering: FlowOffering;
  resourceName: string | null;
  selection: FlowSelection;
  details: Details;
  settings: FlowSettings;
  onEdit: (step: number) => void;
  onBooked: (url: string) => void;
}) {
  const [preview, setPreview] = useState<BookingPreviewDTO | null>(null);
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [pending, startTransition] = useTransition();

  const request = useMemo(
    () => ({
      offeringSlug: offering.slug,
      resourceId: selection.resource,
      date: selection.date!,
      ...(offering.mode === "SLOT" ? { startTime: selection.time! } : {}),
      guestCount: selection.guests,
    }),
    [offering, selection],
  );

  useEffect(() => {
    let cancelled = false;
    previewBookingAction(request).then((result) => {
      if (cancelled) return;
      if (result.ok) setPreview(result.data);
      else setError({ message: result.error, code: result.code });
    });
    return () => {
      cancelled = true;
    };
  }, [request]);

  const book = () =>
    startTransition(async () => {
      setError(null);
      const result = await createBookingAction({
        ...request,
        customer: { name: details.name.trim(), email: details.email.trim(), ...(details.phone.trim() ? { phone: details.phone.trim() } : {}) },
        ...(details.notes.trim() ? { notes: details.notes.trim() } : {}),
      });
      if (result.ok) onBooked(result.data.redirectTo);
      else setError({ message: result.error, code: result.code });
    });

  const taken = error?.code?.startsWith("conflict") || error?.code === "invalid_time" || error?.code === "outside_booking_window";
  const staffOffering = offering.resources.every((r) => r.type === "STAFF");
  const who = resourceName ?? (staffOffering ? "First available" : "Any open place");

  return (
    <div className="space-y-6">
      <Card>
        <dl className="divide-y divide-line">
          <SummaryRow label="Package" value={offering.name} onEdit={() => onEdit(0)} />
          <SummaryRow label={staffOffering ? "With" : "Place"} value={who} onEdit={() => onEdit(0)} />
          <SummaryRow
            label="When"
            value={preview ? formatRange(new Date(preview.startAt), new Date(preview.endAt), settings.timeZone, settings.locale) : "…"}
            onEdit={() => onEdit(1)}
          />
          {offering.maxGuests > 1 && <SummaryRow label="Guests" value={String(selection.guests)} onEdit={() => onEdit(0)} />}
          <SummaryRow label="Name" value={`${details.name} (${details.email})`} onEdit={() => onEdit(2)} />
        </dl>
      </Card>

      <Card className="p-4 sm:p-6" aria-busy={!preview && !error}>
        <h2 className="text-lg font-bold">Price</h2>
        {!preview && !error && (
          <div className="mt-4 space-y-2" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-5 animate-pulse rounded bg-surface-muted" />
            ))}
          </div>
        )}
        {preview && (
          <>
            <dl className="mt-4 space-y-2 text-sm">
              {preview.lines.map((line, i) => {
                // Base → weekend → override are successive prices: earlier ones are shown struck through.
                const superseded = line.kind === "price" && preview.lines.slice(i + 1).some((l) => l.kind === "price");
                return (
                  <div key={`${line.label}-${i}`} className={cn("flex justify-between gap-4", superseded && "text-ink-muted line-through")}>
                    <dt>{line.label}</dt>
                    <dd className="tabular-nums">{line.amount}</dd>
                  </div>
                );
              })}
              <div className="flex justify-between gap-4 border-t border-line pt-3 text-base font-bold">
                <dt>Total</dt>
                <dd className="tabular-nums">{preview.total}</dd>
              </div>
            </dl>
            <div className="mt-5 rounded-control bg-brand-soft p-4">
              <p className="flex justify-between gap-4 font-bold">
                <span>{preview.isFullPayment ? "Pay now" : `Deposit due now (${preview.depositPercent}%)`}</span>
                <span className="tabular-nums">{preview.deposit}</span>
              </p>
              {!preview.isFullPayment && (
                <p className="mt-1 flex justify-between gap-4 text-sm text-ink-muted">
                  <span>Balance, paid on the day</span>
                  <span className="tabular-nums">{preview.balance}</span>
                </p>
              )}
            </div>
          </>
        )}
      </Card>

      {settings.policies && (
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 size-5 shrink-0 accent-[var(--brand)]"
          />
          <span>
            <span className="font-semibold">I agree to the booking policy.</span> <span className="text-ink-muted">{settings.policies}</span>
          </span>
        </label>
      )}

      {error && (
        <div role="alert" className="space-y-3 rounded-card border border-danger/30 bg-danger-soft p-4">
          <p className="font-medium text-danger">{error.message}</p>
          {taken && (
            <Button variant="secondary" size="sm" onClick={() => onEdit(1)}>
              Pick another time
            </Button>
          )}
        </div>
      )}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="ghost" onClick={() => onEdit(2)}>
          Back
        </Button>
        <Button
          size="lg"
          onClick={book}
          loading={pending}
          disabled={!preview || (Boolean(settings.policies) && !agreed)}
          className="sm:min-w-64"
        >
          {preview ? `Continue to payment (${preview.deposit})` : "Continue to payment"}
        </Button>
      </div>
      <p className="text-sm text-ink-muted">
        We&apos;ll hold this for {settings.holdMinutes} minutes while you pay. The booking is confirmed once payment goes through.
      </p>
    </div>
  );
}

function SummaryRow({ label, value, onEdit }: { label: string; value: string; onEdit: () => void }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3.5 sm:px-6">
      <div className="min-w-0">
        <dt className="text-sm text-ink-muted">{label}</dt>
        <dd className="font-semibold break-words tabular-nums">{value}</dd>
      </div>
      <button type="button" onClick={onEdit} className="shrink-0 text-sm font-semibold text-brand-ink underline underline-offset-4">
        Change<span className="sr-only"> {label.toLowerCase()}</span>
      </button>
    </div>
  );
}
