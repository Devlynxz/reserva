import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HoldCountdown } from "../hold-countdown";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

describe("HoldCountdown", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // renderToString is the first render only (no effects), which is exactly what the
  // server sends and what the browser must reproduce when it hydrates. If it read the
  // clock, a render a moment later would differ and React would throw away the tree.
  it("renders the same first HTML on the server and in the browser, a moment later", () => {
    const props = { expiresAt: "2030-01-01T00:15:00.000Z" };
    vi.useFakeTimers();

    vi.setSystemTime(Date.parse("2030-01-01T00:00:00.400Z"));
    const server = renderToString(createElement(HoldCountdown, props));
    vi.setSystemTime(Date.parse("2030-01-01T00:00:01.900Z"));
    const browser = renderToString(createElement(HoldCountdown, props));

    expect(browser).toBe(server);
    expect(server).toContain('role="timer"');
  });
});
