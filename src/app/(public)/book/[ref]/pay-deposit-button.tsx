"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { payDepositAction } from "@/server/actions/booking";

export function PayDepositButton({ reference, token, label }: { reference: string; token?: string; label: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <Button
        size="lg"
        className="w-full"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await payDepositAction(reference, token);
            // Payment pages live on the provider's domain: a full navigation, not a router push.
            if (result.ok) window.location.assign(result.data.redirectTo);
            else setError(result.error);
          })
        }
      >
        {label}
      </Button>
      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
