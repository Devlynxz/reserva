import type { SeedPresetDefinition } from "./types";

const courts = [1, 2, 3, 4].map((n) => `court-${n}`);

export const court: SeedPresetDefinition = {
  settings: {
    businessName: "Dinkside Pickleball Club",
    tagline: "Book a court. Bring a paddle.",
    brandColor: "#1d4ed8",
    currency: "PHP",
    timezone: "Asia/Manila",
    depositPercent: "100",
    holdMinutes: 15,
    weekendDays: [0, 6],
    leadTimeMin: 30,
    maxAdvanceDays: 30,
    contactEmail: "play@dinkside.example",
    contactPhone: "+63 918 555 0199",
    address: "Unit 2, Greenfield Sports Complex, Pasig City",
    policies: "Courts are paid in full when booked. Reschedule up to 24 hours ahead by messaging us. Non-marking shoes only.",
    content: {
      hero: { headline: "Four indoor courts, open 6 AM to 10 PM.", subhead: "Pick a court and an hour. Paddles and balls available to rent." },
      amenities: ["Indoor, air-conditioned", "Paddle rental", "Showers", "Parking", "Water station"],
      faq: [
        { question: "How many players per court?", answer: "Up to four — singles or doubles." },
        { question: "Can I book more than one hour?", answer: "Yes, book consecutive hours one at a time." },
      ],
    },
  },
  resources: courts.map((key, i) => ({
    key,
    name: `Court ${i + 1}`,
    type: "SPACE" as const,
    capacity: 4,
    description: i < 2 ? "Show court with spectator seating." : "Standard indoor court.",
  })),
  offerings: [
    {
      key: "court-hour",
      name: "Court rental (1 hour)",
      description: "One hour on any of our four indoor courts.",
      mode: "SLOT",
      durationMin: 60,
      slotStepMin: 60,
      resourceKeys: courts,
      bufferMin: 0,
      basePrice: "400",
      weekendPrice: "500",
      includedGuests: 4,
      maxGuests: 4,
    },
  ],
  hours: [{ resourceKey: null, weekdays: [0, 1, 2, 3, 4, 5, 6], open: "06:00", close: "22:00" }],
  overrides: () => [],
  blocks: [{ resourceKey: "court-4", dayOffset: 6, reason: "Net and line repainting" }],
  users: {
    admin: { name: "Lara Gomez", email: "owner@dinkside.example" },
    staff: { name: "Ken Uy", email: "desk@dinkside.example" },
  },
  customers: ["Tom Lim", "Aira Cruz", "JP Navarro", "Sam Ong", "Dani Robles", "Gino Perez", "Mika Tan", "Leo Sy"],
};
