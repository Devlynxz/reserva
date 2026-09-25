import { describe, expect, it } from "vitest";
import { REDACTED, scrubEvent, scrubString, scrubValue } from "../scrub";

describe("scrubString", () => {
  it("redacts emails, phone numbers and link tokens", () => {
    expect(scrubString("Booking for maria.santos@example.com failed")).toBe(`Booking for ${REDACTED} failed`);
    expect(scrubString("call +63 917 123 4567 or (02) 8123-4567")).toBe(`call ${REDACTED} or ${REDACTED}`);
    expect(scrubString("0917-123-4567, 09171234567, +639171234567")).toBe(`${REDACTED}, ${REDACTED}, ${REDACTED}`);
    expect(scrubString("/book/RSV-7K3Q9?t=abc123DEF_-x&paid=1")).toBe(`/book/RSV-7K3Q9?t=${REDACTED}&paid=1`);
    expect(scrubString("https://x.example/cb?code=secret#frag")).toBe(`https://x.example/cb?code=${REDACTED}#frag`);
  });

  it("keeps ordinary text, references, amounts and short numbers", () => {
    expect(scrubString("RSV-7K3Q9 conflict at 10:00, total 12000.00, 3 guests")).toBe("RSV-7K3Q9 conflict at 10:00, total 12000.00, 3 guests");
  });
});

describe("scrubValue", () => {
  it("drops sensitive keys and scrubs nested strings", () => {
    expect(
      scrubValue({
        customerEmail: "maria@example.com",
        Authorization: "Bearer x",
        nested: [{ note: "reach me at maria@example.com" }, 42, true, null],
        referenceCode: "RSV-7K3Q9",
      }),
    ).toEqual({
      customerEmail: REDACTED,
      Authorization: REDACTED,
      nested: [{ note: `reach me at ${REDACTED}` }, 42, true, null],
      referenceCode: "RSV-7K3Q9",
    });
  });

  it("survives cycles and very deep objects", () => {
    const loop: Record<string, unknown> = { a: 1 };
    loop.self = loop;
    expect(scrubValue(loop)).toEqual({ a: 1, self: REDACTED });

    let deep: Record<string, unknown> = { leaf: "x" };
    for (let i = 0; i < 20; i++) deep = { child: deep };
    expect(JSON.stringify(scrubValue(deep))).toContain(REDACTED);
  });
});

describe("scrubEvent", () => {
  it("removes the user and request body, scrubs URLs and headers", () => {
    const event = scrubEvent({
      message: "Webhook failed for guest@example.com",
      user: { id: "u1", email: "owner@example.com", ip_address: "203.0.113.7" },
      request: {
        url: "https://resort.example/book/RSV-7K3Q9?t=secret-token",
        headers: { cookie: "better-auth.session_token=abc", "user-agent": "Mozilla" },
        cookies: { a: "b" },
        data: { customer: { name: "Maria" } },
      },
      breadcrumbs: [{ message: "POST /lookup maria@example.com" }],
    });
    expect(event).toEqual({
      message: `Webhook failed for ${REDACTED}`,
      request: {
        url: `https://resort.example/book/RSV-7K3Q9?t=${REDACTED}`,
        headers: { cookie: REDACTED, "user-agent": "Mozilla" },
      },
      breadcrumbs: [{ message: `POST /lookup ${REDACTED}` }],
    });
  });

  it("handles events without a request", () => {
    expect(scrubEvent({ message: "plain" })).toEqual({ message: "plain" });
  });
});
