import Link from "next/link";
import { isDemo } from "@/server/demo";

/** Shown on every page of a demo deployment. */
export function DemoBanner() {
  if (!isDemo()) return null;
  return (
    <div role="region" aria-label="Demo notice" className="bg-ink px-4 py-2 text-center text-sm text-bg">
      <span className="font-semibold">Demo site.</span> Payments are in test mode and anyone can change the data.{" "}
      <Link href="/sign-in" className="font-semibold underline underline-offset-4">
        Open the admin
      </Link>
    </div>
  );
}
