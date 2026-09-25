"use client";

import { createContext, useActionState, useContext, useEffect, useRef } from "react";
import { Button, type ButtonProps, Field, Input, Select, Textarea, cn } from "@/components/ui";
import type { FormState } from "@/server/actions/admin/form";

// Admin forms: a server action + `useActionState`, with field errors flowing to fields
// through context so server-component pages can compose forms from plain props.

const FormStateContext = createContext<FormState>({});

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

export function ActionForm({
  action,
  submitLabel,
  submitVariant,
  resetOnSuccess = false,
  className,
  children,
}: {
  action: Action;
  submitLabel: string;
  submitVariant?: ButtonProps["variant"];
  resetOnSuccess?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok && resetOnSuccess) formRef.current?.reset();
    if (state.fieldErrors) formRef.current?.querySelector<HTMLElement>("[aria-invalid=true]")?.focus();
  }, [state, resetOnSuccess]);

  return (
    <form ref={formRef} action={formAction} className={cn("space-y-4", className)} noValidate>
      <FormStateContext.Provider value={state}>{children}</FormStateContext.Provider>
      {state.error && (
        <p role="alert" className="rounded-control bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
          {state.error}
        </p>
      )}
      {state.ok && state.message && (
        <p role="status" className="rounded-control bg-success-soft px-3 py-2 text-sm font-medium text-success">
          {state.message}
        </p>
      )}
      <Button type="submit" loading={pending} variant={submitVariant}>
        {submitLabel}
      </Button>
    </form>
  );
}

type Common = { name: string; label: string; hint?: string; required?: boolean; className?: string };

type AdminFieldProps = Common &
  (
    | {
        type?: "text" | "email" | "number" | "date" | "time" | "month" | "tel" | "url" | "password";
        defaultValue?: string | number | null;
        placeholder?: string;
        step?: string;
        min?: string | number;
        max?: string | number;
        inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
        autoComplete?: string;
      }
    | { type: "textarea"; defaultValue?: string | null; rows?: number; placeholder?: string }
    | { type: "select"; options: ReadonlyArray<{ value: string; label: string }>; defaultValue?: string | null }
  );

export function AdminField(props: AdminFieldProps) {
  const state = useContext(FormStateContext);
  const { name, label, hint, required, className } = props;
  return (
    <Field label={label} hint={hint} required={required} error={state.fieldErrors?.[name]} className={className}>
      {(control) => {
        if (props.type === "textarea") {
          return <Textarea {...control} name={name} defaultValue={props.defaultValue ?? ""} rows={props.rows} placeholder={props.placeholder} />;
        }
        if (props.type === "select") {
          return (
            <Select {...control} name={name} defaultValue={props.defaultValue ?? ""}>
              {props.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          );
        }
        return (
          <Input
            {...control}
            name={name}
            type={props.type ?? "text"}
            defaultValue={props.defaultValue ?? ""}
            placeholder={props.placeholder}
            step={props.step}
            min={props.min}
            max={props.max}
            inputMode={props.inputMode}
            autoComplete={props.autoComplete}
          />
        );
      }}
    </Field>
  );
}

export function AdminCheckbox({ name, label, hint, defaultChecked }: { name: string; label: string; hint?: string; defaultChecked?: boolean }) {
  return (
    <label className="flex items-start gap-3">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-0.5 size-5 shrink-0 accent-[var(--brand)]" />
      <span>
        <span className="font-semibold">{label}</span>
        {hint && <span className="block text-sm text-ink-muted">{hint}</span>}
      </span>
    </label>
  );
}

export function AdminCheckboxGroup({
  name,
  label,
  options,
  defaultValues = [],
  hint,
  columns = 2,
}: {
  name: string;
  label: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  defaultValues?: readonly string[];
  hint?: string;
  columns?: 2 | 4 | 7;
}) {
  const state = useContext(FormStateContext);
  const error = state.fieldErrors?.[name];
  return (
    <fieldset aria-invalid={error ? true : undefined}>
      <legend className="text-sm font-semibold">{label}</legend>
      {hint && <p className="mt-1 text-sm text-ink-muted">{hint}</p>}
      <div className={cn("mt-2 grid gap-2", columns === 2 && "sm:grid-cols-2", columns === 4 && "grid-cols-2 sm:grid-cols-4", columns === 7 && "grid-cols-4 sm:grid-cols-7")}>
        {options.map((o) => (
          <label key={o.value} className="flex min-h-11 items-center gap-2 rounded-control border border-line px-3 has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
            <input type="checkbox" name={name} value={o.value} defaultChecked={defaultValues.includes(o.value)} className="size-4 accent-[var(--brand)]" />
            <span className="text-sm font-medium">{o.label}</span>
          </label>
        ))}
      </div>
      {error && <p className="mt-1.5 text-sm font-medium text-danger">{error}</p>}
    </fieldset>
  );
}
