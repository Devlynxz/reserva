"use client";

import { useState, useTransition } from "react";
import { Button, type ButtonProps, Dialog } from "@/components/ui";
import type { FormState } from "@/server/actions/admin/form";

/**
 * A button that runs a server action (delete, disable…), optionally behind a confirmation
 * dialog. Errors from the action are shown next to the button.
 */
export function ActionButton({
  action,
  label,
  variant = "secondary",
  size = "sm",
  confirm,
}: {
  action: () => Promise<FormState>;
  label: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  confirm?: { title: string; description: string; confirmLabel: string };
}) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = () =>
    startTransition(async () => {
      setError(null);
      const result = await action();
      setOpen(false);
      if (result.error) setError(result.error);
    });

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button variant={variant} size={size} loading={pending && !confirm} onClick={confirm ? () => setOpen(true) : run}>
        {label}
      </Button>
      {error && (
        <span role="alert" className="text-xs font-medium text-danger">
          {error}
        </span>
      )}
      {confirm && (
        <Dialog
          open={open}
          onClose={() => setOpen(false)}
          title={confirm.title}
          description={confirm.description}
          footer={
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Keep it
              </Button>
              <Button variant="danger" loading={pending} onClick={run}>
                {confirm.confirmLabel}
              </Button>
            </>
          }
        />
      )}
    </span>
  );
}
