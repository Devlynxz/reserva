import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Field,
  Input,
  Select,
  Stepper,
  Table,
  TableEmpty,
  TBody,
  Td,
  Th,
  THead,
  Tr,
  Textarea,
} from "@/components/ui";
import { DialogDemo } from "./dialog-demo";

export const metadata: Metadata = { title: "Design system", robots: { index: false } };

const steps = [
  { id: "package", label: "Package" },
  { id: "date", label: "Date & time" },
  { id: "details", label: "Your details" },
  { id: "review", label: "Review & pay" },
];

// Development-only reference sheet for the UI kit. 404 in production.
export default function DesignSystemPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className="mx-auto max-w-4xl space-y-10 px-4 py-10 sm:px-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-extrabold">Design system</h1>
        <p className="text-ink-muted">Components and tokens. The brand color comes from Settings at runtime.</p>
      </header>

      <section className="space-y-4" aria-labelledby="ds-stepper">
        <h2 id="ds-stepper" className="text-xl font-bold">
          Stepper
        </h2>
        <Card>
          <CardBody>
            <Stepper steps={steps} current={2} />
          </CardBody>
        </Card>
      </section>

      <section className="space-y-4" aria-labelledby="ds-buttons">
        <h2 id="ds-buttons" className="text-xl font-bold">
          Buttons
        </h2>
        <div className="flex flex-wrap gap-3">
          <Button>Pay deposit</Button>
          <Button variant="secondary">Change date</Button>
          <Button variant="ghost">Cancel</Button>
          <Button variant="danger">Cancel booking</Button>
          <Button loading>Paying…</Button>
          <Button size="sm" variant="secondary">
            Small
          </Button>
        </div>
      </section>

      <section className="space-y-4" aria-labelledby="ds-badges">
        <h2 id="ds-badges" className="text-xl font-bold">
          Badges
        </h2>
        <div className="flex flex-wrap gap-2">
          <Badge tone="success" dot>
            Confirmed
          </Badge>
          <Badge tone="warning" dot>
            Awaiting payment
          </Badge>
          <Badge tone="danger" dot>
            Cancelled
          </Badge>
          <Badge tone="neutral" dot>
            Expired
          </Badge>
          <Badge tone="info">Walk-in</Badge>
          <Badge tone="brand">Holy Week rate</Badge>
        </div>
      </section>

      <section className="space-y-4" aria-labelledby="ds-form">
        <h2 id="ds-form" className="text-xl font-bold">
          Form fields
        </h2>
        <Card>
          <CardHeader title="Your details" description="We'll send the confirmation to this email." />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" required>
              {(c) => <Input {...c} autoComplete="name" defaultValue="Maria Santos" />}
            </Field>
            <Field label="Email" required error="Enter an email address like name@example.com.">
              {(c) => <Input {...c} type="email" defaultValue="maria@" />}
            </Field>
            <Field label="Guests" required hint="Up to 12. Extra guests above 8 cost ₱350 each.">
              {(c) => (
                <Select {...c} defaultValue="8">
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i + 1}>{i + 1}</option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Mobile number">{(c) => <Input {...c} type="tel" autoComplete="tel" />}</Field>
            <Field label="Notes for the host" className="sm:col-span-2">
              {(c) => <Textarea {...c} placeholder="Arrival time, celebrations, dietary needs" />}
            </Field>
          </CardBody>
          <CardFooter>
            <Button variant="ghost">Back</Button>
            <Button>Continue to review</Button>
          </CardFooter>
        </Card>
      </section>

      <section className="space-y-4" aria-labelledby="ds-table">
        <h2 id="ds-table" className="text-xl font-bold">
          Table
        </h2>
        <Table label="Upcoming bookings">
          <THead>
            <tr>
              <Th>Reference</Th>
              <Th>Guest</Th>
              <Th>Package</Th>
              <Th>Status</Th>
              <Th className="text-right">Total</Th>
            </tr>
          </THead>
          <TBody>
            <Tr>
              <Td className="font-semibold tabular-nums">RSV-7K3Q9</Td>
              <Td>Maria Santos</Td>
              <Td>Overnight · Main Pool Villa</Td>
              <Td>
                <Badge tone="success" dot>
                  Confirmed
                </Badge>
              </Td>
              <Td numeric>₱12,500.00</Td>
            </Tr>
            <Tr>
              <Td className="font-semibold tabular-nums">RSV-M4TX2</Td>
              <Td>Paolo Reyes</Td>
              <Td>Day Tour · Kubo Cottage</Td>
              <Td>
                <Badge tone="warning" dot>
                  Awaiting payment
                </Badge>
              </Td>
              <Td numeric>₱3,800.00</Td>
            </Tr>
          </TBody>
        </Table>
        <Table label="Cancelled bookings">
          <THead>
            <tr>
              <Th>Reference</Th>
              <Th>Guest</Th>
              <Th className="text-right">Total</Th>
            </tr>
          </THead>
          <TBody>
            <TableEmpty colSpan={3}>No cancelled bookings this month.</TableEmpty>
          </TBody>
        </Table>
      </section>

      <section className="space-y-4" aria-labelledby="ds-dialog">
        <h2 id="ds-dialog" className="text-xl font-bold">
          Dialog
        </h2>
        <DialogDemo />
      </section>
    </main>
  );
}
