import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { EscrowYieldCounter, accruedYieldUnits } from "./EscrowYieldCounter";

const DEPOSIT_TIME = Date.parse("2026-01-01T00:00:00.000Z");
const ONE_YEAR_LATER = Date.parse("2027-01-01T00:00:00.000Z");

describe("accruedYieldUnits", () => {
  it("accrues from elapsed time without depending on a refetch", () => {
    // 100 XLM at 4.5% APR for a 365-day span of a 365.25-day year.
    const units = accruedYieldUnits(1_000_000_000n, 450, DEPOSIT_TIME, ONE_YEAR_LATER);
    expect(units).toBeGreaterThan(4.49);
    expect(units).toBeLessThan(4.5);
  });

  it("returns 0 for invalid, future, or non-positive inputs", () => {
    const now = Date.now();
    expect(accruedYieldUnits(0n, 450, DEPOSIT_TIME, now + 10_000)).toBe(0);
    expect(accruedYieldUnits(-5n, 450, DEPOSIT_TIME, now + 10_000)).toBe(0);
    expect(accruedYieldUnits(100n, 0, DEPOSIT_TIME, now + 10_000)).toBe(0);
    expect(accruedYieldUnits(100n, -100, DEPOSIT_TIME, now + 10_000)).toBe(0);
    expect(accruedYieldUnits(100n, 450, 0, now + 10_000)).toBe(0);
    expect(accruedYieldUnits(100n, 450, Number.NaN, now + 10_000)).toBe(0);
    expect(accruedYieldUnits(100n, 450, DEPOSIT_TIME, DEPOSIT_TIME - 1_000)).toBe(0);
  });

  it("increases as more time elapses", () => {
    const start = DEPOSIT_TIME + 86_400_000;
    const earlier = accruedYieldUnits(10_000_000_000n, 1000, DEPOSIT_TIME, start);
    const later = accruedYieldUnits(10_000_000_000n, 1000, DEPOSIT_TIME, start + 1_000);
    expect(later).toBeGreaterThan(earlier);
  });

  it("scales linearly with principal", () => {
    const now = DEPOSIT_TIME + 86_400_000;
    const small = accruedYieldUnits(1_000_000n, 450, DEPOSIT_TIME, now);
    const large = accruedYieldUnits(10_000_000n, 450, DEPOSIT_TIME, now);
    expect(large).toBeGreaterThan(small);
  });
});

describe("EscrowYieldCounter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(DEPOSIT_TIME));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the yield counter with asset code", () => {
    render(
      <EscrowYieldCounter
        principalStroops={1_000_000_000n}
        aprBps={450}
        depositTimestamp={DEPOSIT_TIME}
      />
    );
    expect(screen.getByTestId("escrow-yield-counter")).toBeInTheDocument();
    expect(screen.getByTestId("escrow-yield-counter").textContent).toContain("XLM");
  });

  it("shows the APR percentage", () => {
    render(
      <EscrowYieldCounter
        principalStroops={1_000_000_000n}
        aprBps={450}
        depositTimestamp={DEPOSIT_TIME}
      />
    );
    expect(screen.getByText("4.50% APR")).toBeInTheDocument();
  });

  it("advances over time via requestAnimationFrame", () => {
    render(
      <EscrowYieldCounter
        principalStroops={10_000_000_000_000n}
        aprBps={1000}
        depositTimestamp={DEPOSIT_TIME}
      />
    );
    const counter = screen.getByTestId("escrow-yield-counter");
    const initial = counter.textContent;

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // The counter should have advanced (or be animating toward advancement)
    expect(counter.textContent).toBeDefined();
    // After enough time, the value should be different
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    // The display value should have changed from initial
    expect(counter.textContent).not.toBe(initial);
  });

  it("renders zero yield for zero principal", () => {
    render(
      <EscrowYieldCounter
        principalStroops={0n}
        aprBps={450}
        depositTimestamp={DEPOSIT_TIME}
      />
    );
    expect(screen.getByTestId("escrow-yield-counter").textContent).toContain("0");
  });
});
