"use client";

import { useActionState, useState } from "react";
import { Button, Dialog, Field, Textarea } from "@/components/ui";
import type { BookingStatus } from "@/lib/booking-status";
import type { FormState } from "@/server/actions/admin/form";

const COPY: Partial<Record<BookingStatus, { button: string; title: string; description: string; danger?: boolean }>> = {
  CONFIRMED: { button: "Confirm", title: "Confirm this booking?", description: "Use this when the customer will pay on the day. They get a confirmation email." },
  CANCELLED: {
    button: "Cancel booking",
    title: "Cancel this booking?",
    description: "The time becomes bookable again and the customer gets an email. Refund any deposit separately.",
    danger: true,
  },
  COMPLETED: { button: "Mark completed", title: "Mark as completed?", description: "The customer came and the booking is done." },
  NO_SHOW: { button: "Mark no-show", title: "Mark as a no-show?", description: "The customer didn't arrive. Any deposit stays recorded." },
};

/** The status changes the state machine allows staff right now, each behind a confirmation. */
export function StatusActions({
  actions,
  action,
}: {
  actions: Array<{ to: BookingStatus; label: string }>;
  action: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [open, setOpen] = useState<BookingStatus | null>(null);
  const copy = open ? COPY[open] : undefined;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {actions.map(({ to }) => (
          <Button key={to} variant={COPY[to]?.danger ? "danger" : "secondary"} onClick={() => setOpen(to)}>
            {COPY[to]?.button ?? to}
          </Button>
        ))}
      </div>
      {state.error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {state.error}
        </p>
      )}
      {state.ok && state.message && (
        <p role="status" className="text-sm font-medium text-success">
          {state.message}
        </p>
      )}
      {open && copy && (
        <Dialog open onClose={() => setOpen(null)} title={copy.title} description={copy.description}>
          <form action={(formData) => { formAction(formData); setOpen(null); }} className="space-y-4">
            <input type="hidden" name="to" value={open} />
            <Field label="Reason or note">{(c) => <Textarea {...c} name="reason" rows={3} maxLength={300} />}</Field>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={() => setOpen(null)}>
                Go back
              </Button>
              <Button type="submit" variant={copy.danger ? "danger" : "primary"} loading={pending}>
                {copy.button}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
