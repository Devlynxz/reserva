"use client";

import { useActionState } from "react";
import { Button, Field, Input } from "@/components/ui";
import { type LookupState, lookupAction } from "@/server/actions/lookup";

export function LookupForm() {
  const [state, formAction, pending] = useActionState<LookupState, FormData>(lookupAction, {});
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <Field label="Booking reference" required error={state.fieldErrors?.reference}>
        {(c) => (
          <Input
            {...c}
            name="reference"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="RSV-7K3Q9"
            className="uppercase tabular-nums"
          />
        )}
      </Field>
      <Field label="Email" required error={state.fieldErrors?.email}>
        {(c) => <Input {...c} name="email" type="email" autoComplete="email" inputMode="email" />}
      </Field>
      {state.error && (
        <p role="alert" className="rounded-control bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
          {state.error}
        </p>
      )}
      <Button type="submit" loading={pending} className="w-full">
        Find booking
      </Button>
    </form>
  );
}
