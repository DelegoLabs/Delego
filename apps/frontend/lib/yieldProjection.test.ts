import { describe, expect, it } from "vitest";
import {
  projectYield,
  BLEND_PROJECTION_APR_PERCENT,
  DEFAULT_HOLDING_DAYS,
  MIN_HOLDING_DAYS,
  MAX_HOLDING_DAYS,
  MAX_PRINCIPAL_USD,
  SLIDER_MAX_HOLDING_DAYS,
} from "./yieldProjection";

describe("projectYield", () => {
  it("projects zero earnings for a zero principal", () => {
    const result = projectYield({ principalAmount: 0, estimatedHoldingDays: 30 });
    expect(result.projectedEarningsUsd).toBe(0);
    expect(result.principalAmount).toBe(0);
  });

  it("projects zero earnings for zero days", () => {
    const result = projectYield({ principalAmount: 1000, estimatedHoldingDays: 0 });
    expect(result.projectedEarningsUsd).toBe(0);
    expect(result.estimatedHoldingDays).toBe(0);
  });

  it("returns zeroed values for negative principal", () => {
    const result = projectYield({ principalAmount: -500, estimatedHoldingDays: 30 });
    expect(result.principalAmount).toBe(0);
    expect(result.projectedEarningsUsd).toBe(0);
  });

  it("returns zeroed values for negative days", () => {
    const result = projectYield({ principalAmount: 1000, estimatedHoldingDays: -10 });
    expect(result.estimatedHoldingDays).toBe(0);
    expect(result.projectedEarningsUsd).toBe(0);
  });

  it("handles non-finite inputs without producing NaN", () => {
    const result = projectYield({
      principalAmount: Number.NaN,
      estimatedHoldingDays: Number.POSITIVE_INFINITY,
    });
    expect(Number.isFinite(result.projectedEarningsUsd)).toBe(true);
    expect(result.projectedEarningsUsd).toBe(0);
  });

  it("uses the default Blend APY when none is supplied", () => {
    const result = projectYield({ principalAmount: 10_000, estimatedHoldingDays: 365 });
    expect(result.aprPercent).toBe(BLEND_PROJECTION_APR_PERCENT);
  });

  it("projects compound interest over one year at the default APY", () => {
    const result = projectYield({
      principalAmount: 10_000,
      estimatedHoldingDays: 365,
      aprPercent: 4.5,
    });
    // 10000 * ((1 + 0.045/365)^365 - 1) ≈ 10000 * 0.04603 ≈ 460.30
    expect(result.projectedEarningsUsd).toBeGreaterThan(450);
    expect(result.projectedEarningsUsd).toBeLessThan(470);
  });

  it("projects higher earnings for longer holding periods", () => {
    const short = projectYield({ principalAmount: 1000, estimatedHoldingDays: 30 });
    const long = projectYield({ principalAmount: 1000, estimatedHoldingDays: 365 });
    expect(long.projectedEarningsUsd).toBeGreaterThan(short.projectedEarningsUsd);
  });

  it("projects higher earnings for larger principals", () => {
    const small = projectYield({ principalAmount: 1000, estimatedHoldingDays: 90 });
    const large = projectYield({ principalAmount: 10_000, estimatedHoldingDays: 90 });
    expect(large.projectedEarningsUsd).toBeGreaterThan(small.projectedEarningsUsd);
  });

  it("compound interest exceeds simple interest over long windows", () => {
    const principal = 50_000;
    const days = 730;
    const apr = 4.5;
    const compound = projectYield({ principalAmount: principal, estimatedHoldingDays: days, aprPercent: apr });
    const simple = principal * (apr / 100) * (days / 365);
    expect(compound.projectedEarningsUsd).toBeGreaterThan(simple);
  });

  it("returns zero earnings when aprPercent is negative", () => {
    const result = projectYield({
      principalAmount: 1000,
      estimatedHoldingDays: 30,
      aprPercent: -5,
    });
    expect(result.projectedEarningsUsd).toBe(0);
    expect(result.aprPercent).toBe(0);
  });

  it("returns zero earnings when aprPercent is zero", () => {
    const result = projectYield({
      principalAmount: 1000,
      estimatedHoldingDays: 30,
      aprPercent: 0,
    });
    expect(result.projectedEarningsUsd).toBe(0);
  });

  it("clamps holding days to the maximum", () => {
    const result = projectYield({
      principalAmount: 1000,
      estimatedHoldingDays: MAX_HOLDING_DAYS + 5000,
    });
    expect(result.estimatedHoldingDays).toBe(MAX_HOLDING_DAYS);
  });

  it("clamps principal to the maximum", () => {
    const result = projectYield({
      principalAmount: MAX_PRINCIPAL_USD + 1_000_000,
      estimatedHoldingDays: 30,
    });
    expect(result.principalAmount).toBe(MAX_PRINCIPAL_USD);
  });

  it("floors fractional days", () => {
    const result = projectYield({ principalAmount: 1000, estimatedHoldingDays: 30.9 });
    expect(result.estimatedHoldingDays).toBe(30);
  });

  it("default holding days constant is 30", () => {
    expect(DEFAULT_HOLDING_DAYS).toBe(30);
  });

  it("slider bounds are sane", () => {
    expect(MIN_HOLDING_DAYS).toBe(1);
    expect(SLIDER_MAX_HOLDING_DAYS).toBeGreaterThan(DEFAULT_HOLDING_DAYS);
    expect(SLIDER_MAX_HOLDING_DAYS).toBeLessThanOrEqual(MAX_HOLDING_DAYS);
  });
});
