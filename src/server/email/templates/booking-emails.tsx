import { Heading, Text } from "@react-email/components";
import { type DetailRow, Details, type EmailBrand, EmailLayout, PrimaryButton, muted, text } from "./layout";

// The four customer emails. Each takes plain, pre-formatted strings, so templates never
// do date or money math and can be previewed with fixture data.

export type BookingEmailProps = {
  brand: EmailBrand;
  /** Readable text color on the brand color (buttons). */
  brandText: string;
  customerName: string;
  referenceCode: string;
  details: DetailRow[];
  /** Customer's booking page (with its access token). */
  link: string;
};

const title = { color: "#02272d", fontSize: "24px", fontWeight: 800, letterSpacing: "-0.01em", lineHeight: "30px", margin: "0 0 12px" } as const;
const reference = { ...text, fontSize: "22px", fontWeight: 800, letterSpacing: "0.08em", margin: "0 0 4px" } as const;

function Reference({ code }: { code: string }) {
  return (
    <>
      <Text style={{ ...muted, margin: "8px 0 0" }}>Reference</Text>
      <Text style={reference}>{code}</Text>
    </>
  );
}

export function BookingReceivedEmail(props: BookingEmailProps & { deposit: string; holdUntil: string }) {
  return (
    <EmailLayout brand={props.brand} preview={`Pay the ${props.deposit} deposit by ${props.holdUntil} to confirm ${props.referenceCode}`}>
      <Heading as="h1" style={title}>
        We&apos;re holding your booking
      </Heading>
      <Text style={text}>
        Hi {props.customerName}, we&apos;re holding this for you until {props.holdUntil}. Pay the {props.deposit} deposit to confirm it.
      </Text>
      <Reference code={props.referenceCode} />
      <Details rows={props.details} />
      <PrimaryButton href={props.link} color={props.brand.brandColor} textColor={props.brandText}>
        View booking and pay
      </PrimaryButton>
      <Text style={muted}>If the deposit isn&apos;t paid in time, the slot is released and nothing is charged.</Text>
    </EmailLayout>
  );
}

export function BookingConfirmedEmail(props: BookingEmailProps & { paid: string; balance: string | null }) {
  return (
    <EmailLayout brand={props.brand} preview={`${props.referenceCode} is confirmed`}>
      <Heading as="h1" style={title}>
        You&apos;re booked
      </Heading>
      <Text style={text}>
        Hi {props.customerName}, we received your payment of {props.paid}. Show this reference when you arrive.
      </Text>
      <Reference code={props.referenceCode} />
      <Details rows={props.details} />
      {props.balance && <Text style={text}>Balance to pay on the day: {props.balance}.</Text>}
      <PrimaryButton href={props.link} color={props.brand.brandColor} textColor={props.brandText}>
        View booking
      </PrimaryButton>
    </EmailLayout>
  );
}

export function BookingReminderEmail(props: BookingEmailProps & { startsAt: string; balance: string | null }) {
  return (
    <EmailLayout brand={props.brand} preview={`See you ${props.startsAt}`}>
      <Heading as="h1" style={title}>
        See you tomorrow
      </Heading>
      <Text style={text}>
        Hi {props.customerName}, a reminder that your booking starts {props.startsAt}.
      </Text>
      <Reference code={props.referenceCode} />
      <Details rows={props.details} />
      {props.balance && <Text style={text}>Balance to pay on arrival: {props.balance}.</Text>}
      {props.brand.address && <Text style={text}>Address: {props.brand.address}</Text>}
      <PrimaryButton href={props.link} color={props.brand.brandColor} textColor={props.brandText}>
        View booking
      </PrimaryButton>
    </EmailLayout>
  );
}

export function BookingCancelledEmail(props: BookingEmailProps & { reason: string | null }) {
  return (
    <EmailLayout brand={props.brand} preview={`${props.referenceCode} was cancelled`}>
      <Heading as="h1" style={title}>
        Your booking was cancelled
      </Heading>
      <Text style={text}>
        Hi {props.customerName}, booking {props.referenceCode} has been cancelled
        {props.reason ? `: ${props.reason}` : "."}
      </Text>
      <Details rows={props.details} />
      <Text style={text}>If you paid a deposit, we&apos;ll be in touch about it. You can reply to this email with any questions.</Text>
      <PrimaryButton href={props.link} color={props.brand.brandColor} textColor={props.brandText}>
        View booking
      </PrimaryButton>
    </EmailLayout>
  );
}
