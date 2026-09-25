"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { type DemoState, demoSignInAction } from "@/server/actions/demo";

export function DemoSignIn() {
  const [ownerState, asOwner, ownerPending] = useActionState<DemoState>(demoSignInAction.bind(null, "ADMIN"), {});
  const [staffState, asStaff, staffPending] = useActionState<DemoState>(demoSignInAction.bind(null, "STAFF"), {});
  const error = ownerState.error ?? staffState.error;

  return (
    <div className="space-y-3 rounded-control border border-info/40 bg-info-soft p-4">
      <p className="text-sm">
        <span className="font-semibold">This is a demo.</span> Look around the admin without an account:
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <form action={asOwner}>
          <Button type="submit" className="w-full" loading={ownerPending} disabled={staffPending}>
            Try it as the owner
          </Button>
        </form>
        <form action={asStaff}>
          <Button type="submit" variant="secondary" className="w-full" loading={staffPending} disabled={ownerPending}>
            Try it as staff
          </Button>
        </form>
      </div>
      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
