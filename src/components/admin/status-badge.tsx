import { Badge, type BadgeTone } from "@/components/ui";
import type { BookingStatus } from "@/lib/booking-status";

export const STATUS_LABEL: Record<BookingStatus, string> = {
  PENDING_PAYMENT: "Awaiting payment",
  CONFIRMED: "Confirmed",
  EXPIRED: "Hold expired",
  CANCELLED: "Cancelled",
  COMPLETED: "Completed",
  NO_SHOW: "No-show",
};

const TONE: Record<BookingStatus, BadgeTone> = {
  PENDING_PAYMENT: "warning",
  CONFIRMED: "success",
  EXPIRED: "neutral",
  CANCELLED: "danger",
  COMPLETED: "info",
  NO_SHOW: "neutral",
};

export function StatusBadge({ status }: { status: BookingStatus }) {
  return (
    <Badge tone={TONE[status]} dot>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

export const SOURCE_LABEL = { ONLINE: "Online", WALK_IN: "Walk-in", MESSAGE: "Message" } as const;
