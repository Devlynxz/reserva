// Props the server hands the booking flow. Everything here is public information;
// prices arrive pre-formatted so the client never does money math.

export type FlowResource = { id: string; name: string; type: "SPACE" | "STAFF"; description: string | null };

export type FlowOffering = {
  slug: string;
  name: string;
  description: string | null;
  mode: "WINDOW" | "SLOT";
  schedule: string;
  price: string;
  weekendPrice: string | null;
  guests: string;
  includedGuests: number;
  maxGuests: number;
  resources: FlowResource[];
};

export type FlowSettings = {
  businessName: string;
  timeZone: string;
  locale: string;
  today: string;
  lastBookableDate: string;
  holdMinutes: number;
  policies: string | null;
};

export type AvailabilityOption = { resourceId: string; startAt: string; endAt: string };

export type FlowSelection = {
  offering: string | null;
  resource: string;
  guests: number;
  date: string | null;
  time: string | null;
};
