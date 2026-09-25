import type { Metadata } from "next";
import { Card, CardBody, CardHeader } from "@/components/ui";
import { LookupForm } from "./lookup-form";

export const metadata: Metadata = {
  title: "Find my booking",
  description: "Look up your booking with its reference and the email you booked with.",
  robots: { index: false },
};

export default function LookupPage() {
  return (
    <main className="mx-auto flex min-h-[70dvh] max-w-md flex-col justify-center px-4 py-12">
      <Card>
        <CardHeader
          as="h1"
          title="Find my booking"
          description="Enter the reference from your confirmation (like RSV-7K3Q9) and the email you booked with."
        />
        <CardBody>
          <LookupForm />
        </CardBody>
      </Card>
    </main>
  );
}
