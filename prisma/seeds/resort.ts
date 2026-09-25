import { type LocalDate, addDays } from "@/lib/dates";
import type { SeedPresetDefinition } from "./types";

/** Easter Sunday (Gregorian), anonymous computus. */
export function easterSunday(year: number): LocalDate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** The next Holy Week (Palm Sunday → Easter Sunday) that hasn't ended yet. */
export function nextHolyWeek(today: LocalDate): { start: LocalDate; end: LocalDate } {
  let year = Number(today.slice(0, 4));
  if (easterSunday(year) < today) year += 1;
  const easter = easterSunday(year);
  return { start: addDays(easter, -7), end: easter };
}

export const resort: SeedPresetDefinition = {
  settings: {
    businessName: "Villa Serena Private Resort",
    tagline: "Your own pool, your own time.",
    brandColor: "#2e7d6b",
    currency: "PHP",
    timezone: "Asia/Manila",
    depositPercent: "50",
    holdMinutes: 15,
    weekendDays: [5, 6], // Friday and Saturday check-ins
    leadTimeMin: 120,
    maxAdvanceDays: 180,
    contactEmail: "hello@villaserena.example",
    contactPhone: "+63 917 555 0142",
    address: "Purok 3, Brgy. Pansol, Calamba, Laguna",
    policies:
      "A 50% deposit confirms your booking; the balance is paid on arrival. Cancel at least 7 days before check-in to move your deposit to another date.",
    content: {
      hero: {
        headline: "A private pool for your group, from sunrise to the next morning.",
        subhead: "Day tours, overnight stays and 22-hour packages in Pansol. See open dates and book in minutes.",
      },
      amenities: ["Heated pool", "Videoke room", "Air-conditioned rooms", "Grill area", "Free parking", "Wi-Fi"],
      faq: [
        { question: "Can we bring our own food?", answer: "Yes. There's a grill and a kitchen with basic utensils." },
        { question: "Is there a corkage fee?", answer: "No corkage fee for drinks you bring yourselves." },
        { question: "What time is check-in?", answer: "It depends on the package: Day Tour 8 AM, Overnight 7 PM, 22 Hours 2 PM." },
      ],
    },
  },
  resources: [
    { key: "main-pool-villa", name: "Main Pool Villa", type: "SPACE", capacity: 30, description: "Two-storey villa with a 12-metre heated pool, four rooms and a videoke lounge." },
    { key: "kubo-cottage", name: "Kubo Cottage", type: "SPACE", capacity: 12, description: "Native-style cottage with a plunge pool and garden, for smaller groups." },
    { key: "function-hall", name: "Function Hall", type: "SPACE", capacity: 150, description: "Air-conditioned hall with a stage and sound system for parties and seminars." },
  ],
  offerings: [
    {
      key: "day-tour",
      name: "Day Tour",
      description: "The pool, grill and videoke lounge for the day.",
      mode: "WINDOW",
      start: "08:00",
      end: "17:00",
      resourceKeys: ["main-pool-villa", "kubo-cottage"],
      bufferMin: 60,
      basePrice: "8000",
      weekendPrice: "10000",
      includedGuests: 10,
      maxGuests: 25,
      extraGuestFee: "250",
    },
    {
      key: "overnight",
      name: "Overnight",
      description: "An evening swim and a night in air-conditioned rooms.",
      mode: "WINDOW",
      start: "19:00",
      end: "07:00",
      resourceKeys: ["main-pool-villa", "kubo-cottage"],
      bufferMin: 60,
      basePrice: "12000",
      weekendPrice: "15000",
      includedGuests: 10,
      maxGuests: 25,
      extraGuestFee: "300",
    },
    {
      key: "22-hours",
      name: "22 Hours",
      description: "Our longest stay: an afternoon swim through to next-day lunch.",
      mode: "WINDOW",
      start: "14:00",
      end: "12:00",
      resourceKeys: ["main-pool-villa", "kubo-cottage"],
      bufferMin: 60,
      basePrice: "16000",
      weekendPrice: "19000",
      includedGuests: 10,
      maxGuests: 25,
      extraGuestFee: "300",
    },
    {
      key: "hall-event",
      name: "Hall Event",
      description: "The function hall with tables, chairs and the sound system.",
      mode: "WINDOW",
      start: "08:00",
      end: "17:00",
      resourceKeys: ["function-hall"],
      bufferMin: 120,
      basePrice: "25000",
      weekendPrice: "30000",
      includedGuests: 100,
      maxGuests: 150,
      extraGuestFee: "150",
    },
  ],
  hours: [], // WINDOW packages have fixed times; business hours only apply to SLOT offerings.
  overrides: (today) => {
    const holyWeek = nextHolyWeek(today);
    return [{ label: "Holy Week", startDate: holyWeek.start, endDate: holyWeek.end, multiplier: "1.5" }];
  },
  blocks: [{ resourceKey: "kubo-cottage", dayOffset: 12, reason: "Pool resurfacing" }],
  users: {
    admin: { name: "Carmela Reyes", email: "owner@villaserena.example" },
    staff: { name: "Jun Dela Cruz", email: "frontdesk@villaserena.example" },
  },
  customers: [
    "Maria Santos",
    "Paolo Reyes",
    "Andrea Villanueva",
    "Mark Bautista",
    "Joy Mendoza",
    "Rico Garcia",
    "Kristine Aquino",
    "Nathan Ramos",
    "Bea Castillo",
    "Miguel Torres",
  ],
};
