import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { axe } from "vitest-axe";
import { YieldCounter, accruedYieldUnits } from "./YieldCounter.js";

const LOCKED = "2026-01-01T00:00:00.000Z";
const ONE_YEAR_LATER = Date.parse("2027-01-01T00:00:00.000Z");

describe("accruedYieldUnits", () => {
  it("accrues from elapsed time without depending on a refetch", () => {
    const units = accruedYieldUnits("1000000000", 5, LOCKED, ONE_YEAR_LATER);
    // 100 XLM at 5% for a 365-day span of a 365.25-day year.
    expect(units).toBeGreaterThan(4.99);
    expect(units).toBeLessThan(5);
  });

  it("returns 0 for invalid, future, or non-positive inputs", () => {
    const now = Date.parse(LOCKED);
    expect(accruedYieldUnits("nope", 5, LOCKED, now + 10_000)).toBe(0);
    expect(accruedYieldUnits("100", Number.NaN, LOCKED, now + 10_000)).toBe(0);
    expect(accruedYieldUnits("100", 5, "yesterday", now)).toBe(0);
    expect(accruedYieldUnits("100", 5, LOCKED, now - 1_000)).toBe(0);
    expect(accruedYieldUnits("0", 5, LOCKED, now + 10_000)).toBe(0);
    expect(accruedYieldUnits("-5", 5, LOCKED, now + 10_000)).toBe(0);
    expect(accruedYieldUnits(String(Number.MIN_VALUE), 0.0001, LOCKED, now + 1)).toBe(0);
    expect(accruedYieldUnits(String(Number.MAX_VALUE), 1e10, LOCKED, ONE_YEAR_LATER)).toBe(0);
  });

  it("increases as more time elapses", () => {
    const start = Date.parse(LOCKED) + 86_400_000;
    const earlier = accruedYieldUnits("10000000000000", 10, LOCKED, start);
    const later = accruedYieldUnits("10000000000000", 10, LOCKED, start + 1_000);
    expect(later).toBeGreaterThan(earlier);
  });
});

describe("YieldCounter", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("has no accessibility violations", async () => {
    const { container } = render(
      <YieldCounter
        principalStroops="1000000000"
        apyPercent={5}
        lockedTimestamp={LOCKED}
        assetCode="XLM"
      />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("shows the asset code and advances every second from elapsed time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(LOCKED));
    render(
      <YieldCounter
        principalStroops="10000000000000"
        apyPercent={10}
        lockedTimestamp={LOCKED}
        assetCode="USDC"
      />
    );
    const counter = screen.getByTestId("yield-counter");
    expect(counter.textContent).toContain("USDC");
    const initial = counter.textContent;
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(counter.textContent).not.toBe(initial);
    expect(counter.textContent).toContain("USDC");
  });
});
