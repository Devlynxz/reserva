import { describe, expect, it } from "vitest";
import { guestsPhrase, offeringCopy, wherePhrase } from "../offering-copy";

const L = "en-PH";
const n = (s: string) => s.replace(/ /g, " ");
const overnight = {
  mode: "WINDOW" as const,
  startMinute: 1140,
  endMinute: 420,
  endsNextDay: true,
  durationMin: null,
  basePrice: "12000",
  weekendPrice: "15000",
  includedGuests: 10,
  maxGuests: 25,
  extraGuestFee: "300",
  resources: [
    { name: "Main Pool Villa", type: "SPACE" as const },
    { name: "Kubo Cottage", type: "SPACE" as const },
  ],
};

describe("offeringCopy", () => {
  it("describes a resort package", () => {
    const copy = offeringCopy(overnight, "PHP", L);
    expect(n(copy.schedule)).toBe("7:00 PM to 7:00 AM the next day");
    expect(copy.price).toBe("₱12,000");
    expect(copy.weekendPrice).toBe("₱15,000");
    expect(copy.where).toBe("At Main Pool Villa or Kubo Cottage");
    expect(copy.guests).toBe("Up to 25 guests. ₱300 per guest above 10.");
  });

  it("omits a weekend price that equals the base price", () => {
    expect(offeringCopy({ ...overnight, weekendPrice: "12000" }, "PHP", L).weekendPrice).toBeNull();
    expect(offeringCopy({ ...overnight, weekendPrice: null }, "PHP", L).weekendPrice).toBeNull();
  });
});

describe("wherePhrase", () => {
  it("uses 'With' for people and handles one or none", () => {
    const staff = [
      { name: "Ana", type: "STAFF" as const },
      { name: "Bea", type: "STAFF" as const },
      { name: "Carlo", type: "STAFF" as const },
    ];
    expect(wherePhrase(staff, L)).toBe("With Ana, Bea, or Carlo");
    expect(wherePhrase([{ name: "Court 1", type: "SPACE" }], L)).toBe("At Court 1");
    expect(wherePhrase([], L)).toBe("");
  });
});

describe("guestsPhrase", () => {
  it("is empty for one-person services and skips a zero fee", () => {
    expect(guestsPhrase({ ...overnight, maxGuests: 1, includedGuests: 1 }, "PHP", L)).toBe("");
    expect(guestsPhrase({ ...overnight, extraGuestFee: "0" }, "PHP", L)).toBe("Up to 25 guests.");
    expect(guestsPhrase({ ...overnight, includedGuests: 25 }, "PHP", L)).toBe("Up to 25 guests.");
  });
});
