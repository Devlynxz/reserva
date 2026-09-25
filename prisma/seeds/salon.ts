import type { SeedPresetDefinition } from "./types";

const everyone = ["ana", "bea", "carlo"];

export const salon: SeedPresetDefinition = {
  settings: {
    businessName: "Salon Ligaya",
    tagline: "Good hair days, booked ahead.",
    brandColor: "#9d174d",
    currency: "PHP",
    timezone: "Asia/Manila",
    depositPercent: "30",
    holdMinutes: 15,
    weekendDays: [0, 6],
    leadTimeMin: 60,
    maxAdvanceDays: 60,
    contactEmail: "hello@salonligaya.example",
    contactPhone: "+63 919 555 0123",
    address: "2F Maginhawa Arcade, Teachers Village, Quezon City",
    policies: "A 30% deposit holds your appointment. Arrive 5 minutes early; we hold your slot for 15 minutes.",
    content: {
      hero: { headline: "Choose your stylist, pick a time, done.", subhead: "Cuts, color and treatments, Tuesday to Sunday." },
      amenities: ["Free coffee", "Wi-Fi", "Air-conditioned", "Card and GCash accepted"],
      faq: [
        { question: "Can I choose any stylist?", answer: "Yes, or pick “Any stylist” for the earliest opening." },
        { question: "How long does color take?", answer: "About two hours, depending on your hair length." },
      ],
    },
  },
  resources: [
    { key: "ana", name: "Ana", type: "STAFF", description: "Senior stylist. Color and keratin specialist." },
    { key: "bea", name: "Bea", type: "STAFF", description: "Cuts and styling for all hair types." },
    { key: "carlo", name: "Carlo", type: "STAFF", description: "Barbering and short cuts. Works late, off Tuesdays." },
  ],
  offerings: [
    { key: "haircut", name: "Haircut", description: "Wash, cut and blow-dry.", mode: "SLOT", durationMin: 45, slotStepMin: 15, bufferMin: 15, resourceKeys: everyone, basePrice: "450", includedGuests: 1, maxGuests: 1 },
    { key: "hair-color", name: "Hair color", description: "Single-process color, root to tip.", mode: "SLOT", durationMin: 120, slotStepMin: 30, bufferMin: 15, resourceKeys: ["ana", "bea"], basePrice: "2500", includedGuests: 1, maxGuests: 1 },
    { key: "blow-dry", name: "Blow-dry & style", description: "Wash and style for an event.", mode: "SLOT", durationMin: 30, slotStepMin: 15, bufferMin: 0, resourceKeys: everyone, basePrice: "350", includedGuests: 1, maxGuests: 1 },
    { key: "hair-spa", name: "Hair spa", description: "Deep-conditioning treatment with scalp massage.", mode: "SLOT", durationMin: 60, slotStepMin: 30, bufferMin: 15, resourceKeys: everyone, basePrice: "800", includedGuests: 1, maxGuests: 1 },
    { key: "keratin", name: "Keratin treatment", description: "Smoothing treatment; lasts about three months.", mode: "SLOT", durationMin: 150, slotStepMin: 30, bufferMin: 15, resourceKeys: ["ana"], basePrice: "3500", includedGuests: 1, maxGuests: 1 },
  ],
  hours: [
    // Salon hours, Tuesday–Sunday. Closed Mondays.
    { resourceKey: null, weekdays: [0, 2, 3, 4, 5, 6], open: "10:00", close: "19:00" },
    // Carlo keeps his own schedule: later hours, off Mondays and Tuesdays.
    { resourceKey: "carlo", weekdays: [0, 3, 4, 5, 6], open: "12:00", close: "20:00" },
  ],
  overrides: () => [],
  blocks: [{ resourceKey: "bea", dayOffset: 9, reason: "Training day" }],
  users: {
    admin: { name: "Ligaya Fernandez", email: "owner@salonligaya.example" },
    staff: { name: "Tess Morales", email: "reception@salonligaya.example" },
  },
  customers: ["Nina Reyes", "Clara Dizon", "Jessa Lopez", "Ivy Santiago", "Rob Manalo", "Pia Salazar", "Ella Gonzales", "Kat Flores"],
};
