import Link from "next/link";
import { buttonStyles } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-start justify-center gap-4 px-4">
      <h1 className="text-2xl font-bold">This page doesn&apos;t exist</h1>
      <p className="text-ink-muted">The link may be old or mistyped. You can start a new booking from the home page.</p>
      <Link href="/" className={buttonStyles({ variant: "secondary" })}>
        Go to the home page
      </Link>
    </main>
  );
}
