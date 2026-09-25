import type { Metadata } from "next";
import { Card, CardBody, CardHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Dashboard", robots: { index: false } };

// Placeholder until Phase 6 (today's bookings, upcoming, revenue, occupancy).
export default function AdminDashboardPage() {
  return (
    <Card>
      <CardHeader as="h1" title="Dashboard" description="Today's bookings and this month's numbers will show here." />
      <CardBody>
        <p className="text-sm text-ink-muted">Nothing to show yet.</p>
      </CardBody>
    </Card>
  );
}
