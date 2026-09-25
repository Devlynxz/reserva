"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/components/auth/auth-client";
import { Button, Field, Input } from "@/components/ui";

export function SignInForm({ next }: { next: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);

    const { error } = await authClient.signIn.email({
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    });

    if (error) {
      setPending(false);
      // One message for every failure: don't reveal whether the email exists.
      setError(
        error.status === 429
          ? "Too many attempts. Wait a minute, then try again."
          : "That email and password don't match an active account.",
      );
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Field label="Email" required>
        {(control) => <Input {...control} name="email" type="email" autoComplete="username" inputMode="email" />}
      </Field>
      <Field label="Password" required>
        {(control) => <Input {...control} name="password" type="password" autoComplete="current-password" />}
      </Field>
      {error && (
        <p role="alert" className="rounded-control bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
          {error}
        </p>
      )}
      <Button type="submit" loading={pending} className="w-full">
        Sign in
      </Button>
    </form>
  );
}
